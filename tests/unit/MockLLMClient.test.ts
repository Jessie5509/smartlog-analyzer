import { describe, it, expect } from "vitest";
import { analysisResultSchema } from "../../src/llm/LLMClient";
import { MockLLMClient } from "../../src/llm/MockLLMClient";

function makeLog(service: string, level: string, message: string) {
  return { timestamp: "2026-11-06T10:00:00Z", service, level, message };
}

const mock = new MockLLMClient(0);

describe("MockLLMClient", () => {
  it("cuenta los errores y las advertencias en el resumen", async () => {
    const result = await mock.analyze([
      makeLog("payments", "ERROR", "Timeout connecting to DB"),
      makeLog("payments", "ERROR", "Connection pool exhausted"),
      makeLog("users", "WARN", "Failed login attempt"),
      makeLog("users", "INFO", "Login ok"),
    ]);

    expect(result.summary).toContain("4 logs");
    expect(result.summary).toContain("2 errores");
    expect(result.summary).toContain("1 advertencias");
  });

  it("agrupa los problemas por categoría", async () => {
    const result = await mock.analyze([
      makeLog("payments", "ERROR", "Timeout connecting to DB"),
      makeLog("shipping", "ERROR", "Carrier API returned 503"),
      makeLog("users", "WARN", "Failed login attempt"),
    ]);

    const names = result.categories.map((category) => category.name);
    expect(names).toContain("database");
    expect(names).toContain("external-service");
    expect(names).toContain("security");
    expect(result.suggestions).toHaveLength(3);
  });

  it("ignora los logs INFO y DEBUG al categorizar", async () => {
    const result = await mock.analyze([
      makeLog("users", "INFO", "Login ok"),
      makeLog("inventory", "DEBUG", "Cache refreshed"),
    ]);

    expect(result.categories).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(result.summary).toContain("no se detectaron problemas");
  });

  it("no se rompe con una lista vacía", async () => {
    const result = await mock.analyze([]);

    expect(result.summary).toContain("0 logs");
    expect(result.categories).toEqual([]);
  });

  it("devuelve siempre el formato que espera la app", async () => {
    const result = await mock.analyze([
      makeLog("payments", "ERROR", "Timeout connecting to DB"),
    ]);

    expect(analysisResultSchema.safeParse(result).success).toBe(true);
  });
});
