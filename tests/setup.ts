import { TEST_DATABASE_URL } from "./config";

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.LLM_PROVIDER = "mock";
