import type { Express } from "express";
import request from "supertest";
import { pool } from "../src/db/pool";
import type { LLMClient } from "../src/llm/LLMClient";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resetDatabase() {
  await pool.query(
    "TRUNCATE logs, analyses, analysis_logs RESTART IDENTITY CASCADE",
  );
}

export function logBody(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: "2026-11-06T10:00:00Z",
    service: "payments",
    level: "ERROR",
    message: "Timeout connecting to DB",
    ...overrides,
  };
}

export async function createLog(
  app: Express,
  overrides: Record<string, unknown> = {},
) {
  const res = await request(app).post("/api/logs").send(logBody(overrides));
  if (res.status !== 201) {
    throw new Error(
      `No se pudo crear el log: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.id as string;
}

export async function waitForAnalysis(app: Express, id: string) {
  for (let i = 0; i < 50; i++) {
    const res = await request(app).get(`/api/analysis/${id}`);
    if (res.body.status !== "pending") return res.body;
    await sleep(50);
  }
  throw new Error("El análisis sigue en pending después de 2.5 segundos");
}

export function fakeLLM(behavior: () => Promise<unknown>): LLMClient {
  return { name: "fake", analyze: behavior };
}

export const validResult = {
  summary: "Resumen de prueba",
  categories: [{ name: "database", description: "Problemas de base de datos" }],
  suggestions: ["Revisar el pool de conexiones"],
};
