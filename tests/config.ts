export const TEST_DB_NAME = "smartlog_test";

export const ADMIN_URL =
  process.env.TEST_ADMIN_URL ??
  "postgres://smartlog:smartlog@localhost:5432/smartlog";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgres://smartlog:smartlog@localhost:5432/${TEST_DB_NAME}`;
