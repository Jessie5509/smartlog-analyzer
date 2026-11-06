import { Router } from "express";
import type { LLMClient } from "../llm/LLMClient";
import { analysisIdSchema, analyzeBodySchema } from "../schemas/analysis";
import { getAnalysis, startAnalysis } from "../services/analysisService";

export function createAnalysisRouter(llm: LLMClient) {
  const router = Router();

  router.post("/logs/analyze", async (req, res) => {
    const { logIds } = analyzeBodySchema.parse(req.body);
    const analysis = await startAnalysis(logIds, llm);
    res.status(202).json(analysis);
  });

  router.get("/analysis/:id", async (req, res) => {
    const id = analysisIdSchema.parse(req.params.id);
    res.json(await getAnalysis(id));
  });

  return router;
}
