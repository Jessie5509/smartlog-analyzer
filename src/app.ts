import express from "express";
import { errorHandler, notFoundHandler } from "./errors";
import { healthRouter } from "./routes/health";
import { logsRouter } from "./routes/logs";

export const app = express();

app.use(express.json({ limit: "1mb" }));

app.use("/api/health", healthRouter);
app.use("/api/logs", logsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
