import { pool } from "../db/pool";
import type { CreateLogInput, ListLogsQuery } from "../schemas/logs";

interface LogRow {
  id: string;
  logged_at: Date;
  service: string;
  level: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

const COLUMNS = "id, logged_at, service, level, message, metadata, created_at";

function toLog(row: LogRow) {
  return {
    id: String(row.id),
    timestamp: row.logged_at.toISOString(),
    service: row.service,
    level: row.level,
    message: row.message,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

export async function insertLog(input: CreateLogInput) {
  const { rows } = await pool.query<LogRow>(
    `INSERT INTO logs (logged_at, service, level, message, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [
      input.timestamp,
      input.service,
      input.level,
      input.message,
      input.metadata ?? null,
    ],
  );
  return toLog(rows[0]);
}

export async function listLogs(q: ListLogsQuery) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (q.service) {
    params.push(q.service);
    conditions.push(`service = $${params.length}`);
  }
  if (q.level) {
    params.push(q.level);
    conditions.push(`level = $${params.length}`);
  }
  if (q.from) {
    params.push(q.from);
    conditions.push(`logged_at >= $${params.length}`);
  }
  if (q.to) {
    params.push(q.to);
    conditions.push(`logged_at < $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [data, count] = await Promise.all([
    pool.query<LogRow>(
      `SELECT ${COLUMNS} FROM logs ${where}
       ORDER BY logged_at DESC, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.limit, q.offset],
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM logs ${where}`,
      params,
    ),
  ]);

  return {
    data: data.rows.map(toLog),
    pagination: {
      limit: q.limit,
      offset: q.offset,
      total: Number(count.rows[0].total),
    },
  };
}
