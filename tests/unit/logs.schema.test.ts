import { describe, it, expect } from "vitest";
import { createLogSchema, listLogsQuerySchema } from "../../src/schemas/logs";

const validLog = {
  timestamp: "2026-11-06T10:00:00Z",
  service: "payments",
  level: "ERROR",
  message: "Timeout connecting to DB",
};

describe("createLogSchema", () => {
  it("acepta un log válido", () => {
    expect(createLogSchema.safeParse(validLog).success).toBe(true);
  });

  it("acepta metadata opcional", () => {
    const log = { ...validLog, metadata: { order_id: "A-1" } };
    expect(createLogSchema.safeParse(log).success).toBe(true);
  });

  it("rechaza un nivel inválido", () => {
    const log = { ...validLog, level: "FATAL" };
    expect(createLogSchema.safeParse(log).success).toBe(false);
  });

  it("rechaza el nivel en minúsculas", () => {
    const log = { ...validLog, level: "error" };
    expect(createLogSchema.safeParse(log).success).toBe(false);
  });

  it("rechaza una fecha que no es ISO 8601", () => {
    expect(
      createLogSchema.safeParse({ ...validLog, timestamp: "ayer" }).success,
    ).toBe(false);
    expect(
      createLogSchema.safeParse({ ...validLog, timestamp: "2026-11-06" })
        .success,
    ).toBe(false);
  });

  it("rechaza un servicio vacío o con solo espacios", () => {
    expect(
      createLogSchema.safeParse({ ...validLog, service: "" }).success,
    ).toBe(false);
    expect(
      createLogSchema.safeParse({ ...validLog, service: "   " }).success,
    ).toBe(false);
  });

  it("rechaza un servicio de más de 100 caracteres", () => {
    const log = { ...validLog, service: "a".repeat(101) };
    expect(createLogSchema.safeParse(log).success).toBe(false);
  });

  it("rechaza un mensaje vacío", () => {
    expect(
      createLogSchema.safeParse({ ...validLog, message: "" }).success,
    ).toBe(false);
  });

  it("rechaza metadata que no es un objeto", () => {
    const log = { ...validLog, metadata: "texto" };
    expect(createLogSchema.safeParse(log).success).toBe(false);
  });

  it("rechaza un log al que le falta un campo obligatorio", () => {
    const { message, ...sinMensaje } = validLog;
    expect(createLogSchema.safeParse(sinMensaje).success).toBe(false);
  });
});

describe("listLogsQuerySchema", () => {
  it("usa limit 50 y offset 0 por defecto", () => {
    const result = listLogsQuerySchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("convierte limit y offset de texto a número", () => {
    const result = listLogsQuerySchema.parse({ limit: "10", offset: "20" });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(20);
  });

  it("rechaza un limit fuera de rango", () => {
    expect(listLogsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listLogsQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
  });

  it("rechaza un limit que no es un número", () => {
    expect(listLogsQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
  });

  it("rechaza un offset negativo", () => {
    expect(listLogsQuerySchema.safeParse({ offset: "-1" }).success).toBe(false);
  });

  it("rechaza un nivel inválido", () => {
    expect(listLogsQuerySchema.safeParse({ level: "FATAL" }).success).toBe(
      false,
    );
  });

  it("rechaza un rango donde from es posterior a to", () => {
    const result = listLogsQuerySchema.safeParse({
      from: "2026-11-06T00:00:00Z",
      to: "2026-11-05T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("acepta un rango donde from es igual a to", () => {
    const result = listLogsQuerySchema.safeParse({
      from: "2026-11-05T00:00:00Z",
      to: "2026-11-05T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});
