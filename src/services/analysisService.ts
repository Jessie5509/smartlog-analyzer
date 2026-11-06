import { pool } from "../db/pool";
import { AppError } from "../errors";
import { analysisResultSchema } from "../llm/LLMClient";
import type {
  AnalysisResult,
  LLMClient,
  LogForAnalysis,
} from "../llm/LLMClient";

export const MAX_LOGS_PER_ANALYSIS = 200;

const ANALYSIS_COLUMNS = `
  id,
  status,
  log_count AS "logCount",
  summary,
  categories,
  suggestions,
  error,
  provider,
  created_at AS "createdAt",
  completed_at AS "completedAt"
`;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new AppError(
          504,
          "LLM_TIMEOUT",
          `The LLM did not respond within ${ms} ms`,
        ),
      );
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function markCompleted(analysisId: string, result: AnalysisResult) {
  await pool.query(
    `UPDATE analyses
     SET status = 'completed', summary = $2, categories = $3, suggestions = $4, completed_at = now()
     WHERE id = $1`,
    [
      analysisId,
      result.summary,
      JSON.stringify(result.categories),
      JSON.stringify(result.suggestions),
    ],
  );
}

async function markFailed(analysisId: string, reason: string) {
  await pool.query(
    `UPDATE analyses SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`,
    [analysisId, reason],
  );
}

export async function runAnalysis(
  analysisId: string,
  logs: LogForAnalysis[],
  llm: LLMClient,
  timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 10000,
) {
  try {
    const rawResult = await withTimeout(llm.analyze(logs), timeoutMs);
    const parsed = analysisResultSchema.safeParse(rawResult);
    if (!parsed.success) {
      throw new AppError(
        502,
        "LLM_INVALID_RESPONSE",
        "The LLM response has an unexpected format",
      );
    }

    await markCompleted(analysisId, parsed.data);
  } catch (err) {
    console.error("Analysis failed:", analysisId, err);

    const reason =
      err instanceof AppError
        ? `${err.code}: ${err.message}`
        : "LLM_ERROR: the LLM call failed";
    await markFailed(analysisId, reason);
  }
}

export async function startAnalysis(logIds: string[], llm: LLMClient) {
  const ids = [...new Set(logIds)];

  if (ids.length > MAX_LOGS_PER_ANALYSIS) {
    throw new AppError(
      422,
      "TOO_MANY_LOGS",
      `Maximum ${MAX_LOGS_PER_ANALYSIS} logs per analysis`,
    );
  }

  const logsResult = await pool.query(
    `SELECT id::text AS id, logged_at AS "timestamp", service, level, message
     FROM logs
     WHERE id = ANY($1::bigint[])
     ORDER BY logged_at`,
    [ids],
  );
  const rows = logsResult.rows;

  if (rows.length !== ids.length) {
    const foundIds = rows.map((row) => row.id);
    const missing = ids.filter((id) => !foundIds.includes(id));
    throw new AppError(422, "LOGS_NOT_FOUND", "Some log ids do not exist", {
      missing,
    });
  }

  const logs: LogForAnalysis[] = rows.map((row) => ({
    timestamp: row.timestamp.toISOString(),
    service: row.service,
    level: row.level,
    message: row.message,
  }));

  const client = await pool.connect();
  let analysisId: string;
  try {
    await client.query("BEGIN");
    const created = await client.query(
      `INSERT INTO analyses (status, log_count, provider) VALUES ('pending', $1, $2) RETURNING id`,
      [logs.length, llm.name],
    );
    analysisId = created.rows[0].id;
    await client.query(
      `INSERT INTO analysis_logs (analysis_id, log_id)
       SELECT $1::uuid, UNNEST($2::bigint[])`,
      [analysisId, ids],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  runAnalysis(analysisId, logs, llm).catch((err) =>
    console.error("Unexpected error:", err),
  );

  return { id: analysisId, status: "pending" };
}

export async function getAnalysis(id: string) {
  const result = await pool.query(
    `SELECT ${ANALYSIS_COLUMNS} FROM analyses WHERE id = $1`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new AppError(404, "NOT_FOUND", "Analysis not found");
  }
  return result.rows[0];
}
