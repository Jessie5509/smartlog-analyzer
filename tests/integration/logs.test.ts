import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { pool } from "../../src/db/pool";
import { MockLLMClient } from "../../src/llm/MockLLMClient";
import { createLog, logBody, resetDatabase } from "../helpers";

const app = createApp(new MockLLMClient(0));

beforeEach(resetDatabase);
afterAll(() => pool.end());

async function seedFourLogs() {
  await createLog(app, {
    timestamp: "2026-11-04T10:00:00Z",
    service: "payments",
    level: "INFO",
    message: "a",
  });
  await createLog(app, {
    timestamp: "2026-11-05T10:00:00Z",
    service: "payments",
    level: "ERROR",
    message: "b",
  });
  await createLog(app, {
    timestamp: "2026-11-05T12:00:00Z",
    service: "users",
    level: "WARN",
    message: "c",
  });
  await createLog(app, {
    timestamp: "2026-11-06T10:00:00Z",
    service: "users",
    level: "ERROR",
    message: "d",
  });
}

describe("GET /api/health", () => {
  it("responde ok cuando la base funciona", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "up" });
  });
});

describe("rutas inexistentes", () => {
  it("responde 404 con el formato de error", async () => {
    const res = await request(app).get("/api/no-existe");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/logs", () => {
  it("crea un log y responde 201", async () => {
    const res = await request(app).post("/api/logs").send(logBody());

    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe("string");
    expect(res.body.service).toBe("payments");
    expect(res.body.level).toBe("ERROR");
    expect(res.body.timestamp).toBe("2026-11-06T10:00:00.000Z");
    expect(res.body.createdAt).toBeDefined();
  });

  it("guarda la metadata y la devuelve igual", async () => {
    const res = await request(app)
      .post("/api/logs")
      .send(logBody({ metadata: { order_id: "A-1", retries: 3 } }));

    expect(res.status).toBe(201);
    expect(res.body.metadata).toEqual({ order_id: "A-1", retries: 3 });
  });

  it("el log creado aparece en el listado", async () => {
    await request(app)
      .post("/api/logs")
      .send(logBody({ message: "hola" }));

    const list = await request(app).get("/api/logs");
    expect(list.body.pagination.total).toBe(1);
    expect(list.body.data[0].message).toBe("hola");
  });

  it("rechaza un nivel inválido con 400 y dice qué campo falló", async () => {
    const res = await request(app)
      .post("/api/logs")
      .send(logBody({ level: "FATAL" }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "level" })]),
    );
  });

  it("rechaza una fecha mal escrita", async () => {
    const res = await request(app)
      .post("/api/logs")
      .send(logBody({ timestamp: "ayer" }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rechaza un body vacío", async () => {
    const res = await request(app).post("/api/logs").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rechaza un JSON mal formado", async () => {
    const res = await request(app)
      .post("/api/logs")
      .set("Content-Type", "application/json")
      .send("{esto no es json");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("rechaza un body demasiado grande con 413", async () => {
    const res = await request(app)
      .post("/api/logs")
      .send(logBody({ message: "a".repeat(1_100_000) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("no guarda nada cuando la validación falla", async () => {
    await request(app)
      .post("/api/logs")
      .send(logBody({ level: "FATAL" }));

    const list = await request(app).get("/api/logs");
    expect(list.body.pagination.total).toBe(0);
  });
});

describe("GET /api/logs", () => {
  it("devuelve una lista vacía cuando no hay logs", async () => {
    const res = await request(app).get("/api/logs");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it("ordena del más reciente al más antiguo", async () => {
    await seedFourLogs();

    const res = await request(app).get("/api/logs");
    const messages = res.body.data.map(
      (log: { message: string }) => log.message,
    );

    expect(messages).toEqual(["d", "c", "b", "a"]);
  });

  it("filtra por servicio", async () => {
    await seedFourLogs();

    const res = await request(app).get("/api/logs").query({ service: "users" });
    const messages = res.body.data.map(
      (log: { message: string }) => log.message,
    );

    expect(messages).toEqual(["d", "c"]);
  });

  it("filtra por nivel", async () => {
    await seedFourLogs();

    const res = await request(app).get("/api/logs").query({ level: "ERROR" });
    const messages = res.body.data.map(
      (log: { message: string }) => log.message,
    );

    expect(messages).toEqual(["d", "b"]);
  });

  it("combina varios filtros", async () => {
    await seedFourLogs();

    const res = await request(app)
      .get("/api/logs")
      .query({ service: "users", level: "ERROR" });

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].message).toBe("d");
  });

  it("filtra por rango de fechas", async () => {
    await seedFourLogs();

    const res = await request(app)
      .get("/api/logs")
      .query({ from: "2026-11-05T00:00:00Z", to: "2026-11-06T00:00:00Z" });
    const messages = res.body.data.map(
      (log: { message: string }) => log.message,
    );

    expect(messages).toEqual(["c", "b"]);
  });

  it("incluye el límite 'from' y excluye el límite 'to'", async () => {
    await seedFourLogs();

    const incluido = await request(app)
      .get("/api/logs")
      .query({ from: "2026-11-05T10:00:00Z", to: "2026-11-05T10:00:01Z" });
    expect(incluido.body.data).toHaveLength(1);
    expect(incluido.body.data[0].message).toBe("b");

    const excluido = await request(app)
      .get("/api/logs")
      .query({ from: "2026-11-05T00:00:00Z", to: "2026-11-05T10:00:00Z" });
    expect(excluido.body.data).toEqual([]);
  });

  it("pagina con limit y offset e informa el total", async () => {
    await seedFourLogs();

    const res = await request(app)
      .get("/api/logs")
      .query({ limit: 2, offset: 1 });
    const messages = res.body.data.map(
      (log: { message: string }) => log.message,
    );

    expect(messages).toEqual(["c", "b"]);
    expect(res.body.pagination).toEqual({ limit: 2, offset: 1, total: 4 });
  });

  it("devuelve vacío si el offset supera el total", async () => {
    await seedFourLogs();

    const res = await request(app).get("/api/logs").query({ offset: 100 });

    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(4);
  });

  it("rechaza un limit fuera de rango", async () => {
    expect(
      (await request(app).get("/api/logs").query({ limit: 0 })).status,
    ).toBe(400);
    expect(
      (await request(app).get("/api/logs").query({ limit: 201 })).status,
    ).toBe(400);
  });

  it("rechaza un nivel inválido", async () => {
    const res = await request(app).get("/api/logs").query({ level: "FATAL" });

    expect(res.status).toBe(400);
  });

  it("rechaza un rango donde from es posterior a to", async () => {
    const res = await request(app)
      .get("/api/logs")
      .query({ from: "2026-11-06T00:00:00Z", to: "2026-11-05T00:00:00Z" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("no es vulnerable a inyección SQL en los filtros", async () => {
    await seedFourLogs();

    const res = await request(app)
      .get("/api/logs")
      .query({ service: "x'; DROP TABLE logs; --" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);

    const list = await request(app).get("/api/logs");
    expect(list.body.pagination.total).toBe(4);
  });
});
