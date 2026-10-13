import { DemoProvider } from "./demo";
import { OpenAIProvider } from "./openai";
import type { LLMProvider } from "../types";
import { isDemoMode } from "@/lib/security/mode";

let cached: LLMProvider | null = null;

/**
 * Returns the active LLM provider.
 *
 *  - demo mode        → deterministic DemoProvider (no network);
 *  - connected mode   → OpenAIProvider when OPENAI_API_KEY is set;
 *  - connected mode without a key → explicit error (never a silent demo fallback).
 */
export function getLLMProvider(): LLMProvider {
  if (cached) return cached;
  if (isDemoMode()) {
    cached = new DemoProvider();
  } else if (process.env.OPENAI_API_KEY) {
    cached = new OpenAIProvider();
  } else {
    throw new Error(
      "Connected mode (DEMO_MODE=false) requires OPENAI_API_KEY. Set it, or run with DEMO_MODE=true.",
    );
  }
  return cached;
}

export function getLLMProviderForTest(provider?: LLMProvider): LLMProvider {
  return provider ?? new DemoProvider();
}

export { DemoProvider } from "./demo";
export { OpenAIProvider } from "./openai";
export type { LLMProvider } from "../types";
