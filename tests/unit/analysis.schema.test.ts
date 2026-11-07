import { describe, it, expect } from "vitest";
import { analysisResultSchema } from "../../src/llm/LLMClient";
import {
  analysisIdSchema,
  analyzeBodySchema,
} from "../../src/schemas/analysis";

describe("analyzeBodySchema", () => {
  it("acepta una lista de ids numéricos en texto", () => {
    expect(analyzeBodySchema.safeParse({ logIds: ["1", "2"] }).success).toBe(
      true,
    );
  });

  it("rechaza una lista vacía", () => {
    expect(analyzeBodySchema.safeParse({ logIds: [] }).success).toBe(false);
  });

  it("rechaza ids que no son texto", () => {
    expect(analyzeBodySchema.safeParse({ logIds: [1, 2] }).success).toBe(false);
  });

  it("rechaza ids que no son numéricos", () => {
    expect(analyzeBodySchema.safeParse({ logIds: ["abc"] }).success).toBe(
      false,
    );
  });

  it("rechaza un body sin logIds", () => {
    expect(analyzeBodySchema.safeParse({}).success).toBe(false);
  });
});

describe("analysisIdSchema", () => {
  it("acepta un UUID", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(analysisIdSchema.safeParse(id).success).toBe(true);
  });

  it("rechaza un id que no es un UUID", () => {
    expect(analysisIdSchema.safeParse("hola").success).toBe(false);
  });
});

describe("analysisResultSchema (respuesta esperada del LLM)", () => {
  const validResult = {
    summary: "El servicio payments tiene errores de conexión.",
    categories: [{ name: "database", description: "Timeouts repetidos" }],
    suggestions: ["Revisar el pool de conexiones"],
  };

  it("acepta una respuesta válida", () => {
    expect(analysisResultSchema.safeParse(validResult).success).toBe(true);
  });

  it("acepta categorías y sugerencias vacías (cuando no hay problemas)", () => {
    const result = {
      summary: "Sin problemas.",
      categories: [],
      suggestions: [],
    };
    expect(analysisResultSchema.safeParse(result).success).toBe(true);
  });

  it("rechaza una respuesta sin resumen", () => {
    const { summary, ...sinResumen } = validResult;
    expect(analysisResultSchema.safeParse(sinResumen).success).toBe(false);
  });

  it("rechaza un resumen vacío", () => {
    expect(
      analysisResultSchema.safeParse({ ...validResult, summary: "" }).success,
    ).toBe(false);
  });

  it("rechaza categorías que no son una lista", () => {
    const result = { ...validResult, categories: "database" };
    expect(analysisResultSchema.safeParse(result).success).toBe(false);
  });

  it("rechaza una categoría sin nombre", () => {
    const result = { ...validResult, categories: [{ description: "algo" }] };
    expect(analysisResultSchema.safeParse(result).success).toBe(false);
  });

  it("rechaza una respuesta que no es un objeto", () => {
    expect(analysisResultSchema.safeParse("texto cualquiera").success).toBe(
      false,
    );
    expect(analysisResultSchema.safeParse(null).success).toBe(false);
  });
});
