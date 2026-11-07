import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createApp } from "../../src/app";
import { pool } from "../../src/db/pool";
import { MockLLMClient } from "../../src/llm/MockLLMClient";
import {
  createLog,
  fakeLLM,
  resetDatabase,
  sleep,
  validResult,
  waitForAnalysis,
} from "../helpers";

beforeEach(resetDatabase);
afterAll(() => pool.end());

async function countRows(table: string) {
  const result = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return result.rows[0].n as number;
}

describe("análisis con el mock (camino feliz)", () => {
  const app = createApp(new MockLLMClient(0));

  it("responde 202 pending y después completa el análisis", async () => {
    const id1 = await createLog(app, { message: "Timeout connecting to DB" });
    const id2 = await createLog(app, { message: "Connection pool exhausted" });

    const res = await request(app)
      .post("/api/logs/analyze")
      .send({ logIds: [id1, id2] });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("pending");

    const analysis = await waitForAnalysis(app, res.body.id);
    expect(analysis.status).toBe("completed");
    expect(analysis.logCount).toBe(2);
    expect(analysis.provider).toBe("mock");
    expect(analysis.summary).toContain("2 logs");
    expect(analysis.categories[0].name).toBe("database");
    expect(analysis.completedAt).not.toBeNull();
  });

  it("guarda qué logs se analizaron", async () => {
    const id1 = await createLog(app);
    const id2 = await createLog(app);

    const res = await request(app)
      .post("/api/logs/analyze")
      .send({ logIds: [id1, id2] });
    await waitForAnalysis(app, res.body.id);

    expect(await countRows("analysis_logs")).toBe(2);
  });

  it("ignora los ids repetidos", async () => {
    const id = await createLog(app);

    const res = await request(app)
      .post("/api/logs/analyze")
      .send({ logIds: [id, id] });
    const analysis = await waitForAnalysis(app, res.body.id);

    expect(analysis.logCount).toBe(1);
  });

  it("permite consultar el análisis mientras todavía está pendiente", async () => {
    const slowApp = createApp(
      fakeLLM(async () => {
        await sleep(300);
        return validResult;
      }),
    );
    const logId = await createLog(slowApp);

    const res = await request(slowApp)
      .post("/api/logs/analyze")
      .send({ logIds: [logId] });
    const enCurso = await request(slowApp).get(`/api/analysis/${res.body.id}`);
    expect(enCurso.body.status).toBe("pending");

    const terminado = await waitForAnalysis(slowApp, res.body.id);
    expect(terminado.status).toBe("completed");
    expect(terminado.summary).toBe("Resumen de prueba");
  });
});

describe("fallas del LLM", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LLM_TIMEOUT_MS;
  });

  async function analyzeWith(llm: ReturnType<typeof fakeLLM>) {
    const app = createApp(llm);
    const logId = await createLog(app);
    const res = await request(app)
      .post("/api/logs/analyze")
      .send({ logIds: [logId] });
    return waitForAnalysis(app, res.body.id);
  }

  it("respuesta válida: queda completed", async () => {
    const analysis = await analyzeWith(fakeLLM(async () => validResult));

    expect(analysis.status).toBe("completed");
    expect(analysis.provider).toBe("fake");
    expect(analysis.suggestions).toEqual(["Revisar el pool de conexiones"]);
  });

  it("formato inesperado: queda failed con LLM_INVALID_RESPONSE", async () => {
    const analysis = await analyzeWith(
      fakeLLM(async () => ({ texto: "algo raro" })),
    );

    expect(analysis.status).toBe("failed");
    expect(analysis.error).toContain("LLM_INVALID_RESPONSE");
    expect(analysis.summary).toBeNull();
  });

  it("respuesta vacía (null): queda failed", async () => {
    const analysis = await analyzeWith(fakeLLM(async () => null));

    expect(analysis.status).toBe("failed");
    expect(analysis.error).toContain("LLM_INVALID_RESPONSE");
  });

  it("demora excesiva: queda failed con LLM_TIMEOUT", async () => {
    process.env.LLM_TIMEOUT_MS = "100";

    const analysis = await analyzeWith(
      fakeLLM(async () => {
        await sleep(500);
        return validResult;
      }),
    );

    expect(analysis.status).toBe("failed");
    expect(analysis.error).toContain("LLM_TIMEOUT");
  });

  it("el LLM lanza un error: queda failed y no se filtra el detalle interno", async () => {
    const analysis = await analyzeWith(
      fakeLLM(async () => {
        throw new Error("clave secreta abc123 rechazada");
      }),
    );

    expect(analysis.status).toBe("failed");
    expect(analysis.error).toContain("LLM_ERROR");
    expect(analysis.error).not.toContain("abc123");
  });
});

describe("POST /api/logs/analyze: validación", () => {
  const app = createApp(new MockLLMClient(0));

  it("rechaza ids que no existen con 422 y dice cuáles", async () => {
    const res = await request(app)
      .post("/api/logs/analyze")
      .send({ logIds: ["999"] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("LOGS_NOT_FOUND");
    expect(res.body.error.details.missing).toEqual(["999"]);
  });

  it("si falta algún id no crea ningún análisis", async () => {
    const existente = await createLog(app);

    const res = await request(app)
      .post("/api/logs/analyze")
      .send({ logIds: [existente, "999"] });

    expect(res.status).toBe(422);
    expect(await countRows("analyses")).toBe(0);
    expect(await countRows("analysis_logs")).toBe(0);
  });

  it("rechaza una lista vacía", async () => {
    const res = await request(app)
      .post("/api/logs/analyze")
      .send({ logIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rechaza ids que no son texto numérico", async () => {
    expect(
      (
        await request(app)
          .post("/api/logs/analyze")
          .send({ logIds: [1, 2] })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/logs/analyze")
          .send({ logIds: ["abc"] })
      ).status,
    ).toBe(400);
  });

  it("rechaza un pedido sin body", async () => {
    const res = await request(app).post("/api/logs/analyze");

    expect(res.status).toBe(400);
  });

  it("rechaza más de 200 logs con 422", async () => {
    const logIds = Array.from({ length: 201 }, (_, i) => String(i + 1));

    const res = await request(app).post("/api/logs/analyze").send({ logIds });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("TOO_MANY_LOGS");
  });
});

describe("GET /api/analysis/:id", () => {
  const app = createApp(new MockLLMClient(0));

  it("responde 404 si el análisis no existe", async () => {
    const res = await request(app).get(
      "/api/analysis/22222222-2222-2222-2222-222222222222",
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("responde 400 si el id no es un UUID", async () => {
    const res = await request(app).get("/api/analysis/hola");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
