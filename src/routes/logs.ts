import { Router } from "express";
import { createLogSchema, listLogsQuerySchema } from "../schemas/logs";
import { insertLog, listLogs } from "../services/logsService";

export const logsRouter = Router();

logsRouter.post("/", async (req, res) => {
  const input = createLogSchema.parse(req.body);
  const log = await insertLog(input);
  res.status(201).json(log);
});

logsRouter.get("/", async (req, res) => {
  const query = listLogsQuerySchema.parse(req.query);
  res.json(await listLogs(query));
});