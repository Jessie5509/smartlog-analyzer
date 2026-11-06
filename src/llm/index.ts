import type { LLMClient } from "./LLMClient";
import { MockLLMClient } from "./MockLLMClient";

export function createLLMClient(): LLMClient {
  const provider = process.env.LLM_PROVIDER ?? "mock";

  if (provider === "mock") {
    return new MockLLMClient();
  }

  throw new Error(`LLM_PROVIDER "${provider}" is not implemented`);
}