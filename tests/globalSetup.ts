import { readFileSync } from "node:fs";
import { Client } from "pg";
import { ADMIN_URL, TEST_DATABASE_URL, TEST_DB_NAME } from "./config";

export default async function setup() {
  if (!TEST_DATABASE_URL.includes("_test")) {
    throw new Error(
      "TEST_DATABASE_URL debe apuntar a una base cuyo nombre incluya '_test'",
    );
  }

  const admin = new Client({ connectionString: ADMIN_URL });
  try {
    await admin.connect();
  } catch {
    throw new Error(
      "No se pudo conectar a PostgreSQL. Levantá la base con: docker compose up -d",
    );
  }

  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [TEST_DB_NAME],
  );
  if (exists.rows.length === 0) {
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  }
  await admin.end();

  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await client.query(
    readFileSync("db/migrations/001_create_tables.sql", "utf8"),
  );
  await client.end();
}
