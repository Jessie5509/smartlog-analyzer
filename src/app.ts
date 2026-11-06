import express from "express";
import { errorHandler, notFoundHandler } from "./errors";
import { createLLMClient } from "./llm";
import type { LLMClient } from "./llm/LLMClient";
import { createAnalysisRouter } from "./routes/analysis";
import { healthRouter } from "./routes/health";
import { logsRouter } from "./routes/logs";

export function createApp(llm: LLMClient = createLLMClient()) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/logs", logsRouter);
  app.use("/api", createAnalysisRouter(llm));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
