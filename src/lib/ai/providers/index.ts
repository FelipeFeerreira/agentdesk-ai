import { DemoProvider } from "./demo";
import { OpenAIProvider } from "./openai";
import type { LLMProvider } from "../types";

let cached: LLMProvider | null = null;

/**
 * Returns the active LLM provider. Uses OpenAI when a key is present and
 * DEMO_MODE is not forced on; otherwise the deterministic demo provider.
 */
export function getLLMProvider(): LLMProvider {
  if (cached) return cached;
  const demoMode = (process.env.DEMO_MODE ?? "true") !== "false";
  if (!demoMode && process.env.OPENAI_API_KEY) {
    cached = new OpenAIProvider();
  } else {
    cached = new DemoProvider();
  }
  return cached;
}

export function getLLMProviderForTest(provider?: LLMProvider): LLMProvider {
  return provider ?? new DemoProvider();
}

export { DemoProvider } from "./demo";
export { OpenAIProvider } from "./openai";
export type { LLMProvider } from "../types";
