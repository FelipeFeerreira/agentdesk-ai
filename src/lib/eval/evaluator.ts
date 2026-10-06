import { prisma } from "@/lib/db";
import { getLLMProviderForTest } from "@/lib/ai/providers";
import { retrieveChunks } from "@/lib/rag/vectorstore";
import type { LLMProvider } from "@/lib/ai/types";
import type { EvalCase } from "./cases";

export interface EvalCaseResult {
  name: string;
  category: string;
  input: string;
  expectedIntent: string;
  actualIntent: string;
  expectedTool: string | null;
  actualTool: string | null;
  expectedEscalate: boolean;
  actualEscalate: boolean;
  intentMatch: boolean;
  toolMatch: boolean;
  escalateMatch: boolean;
  passed: boolean;
  latencyMs: number;
}

export interface EvalRunMetrics {
  total: number;
  passed: number;
  failed: number;
  intentAccuracy: number;
  toolAccuracy: number;
  escalationAccuracy: number;
  /** RAG retrieval success over knowledge-base cases (null when no such cases). */
  ragSuccessRate: number | null;
  /** How out-of-scope requests were handled (null when no such cases). */
  unsupportedHandlingRate: number | null;
  avgLatencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Transparent token-based estimate, labelled clearly in the UI. */
  estimatedCostUsd: number;
  provider: string;
  mode: "demo" | "live";
}

// Tools that read/write real business data — out-of-scope requests must not reach these.
const DATA_TOOLS = new Set([
  "get_order_status",
  "refund_order",
  "get_customer_profile",
  "create_crm_contact",
  "create_crm_deal",
]);

const RAG_TOOL = "search_knowledge_base";

/**
 * Evaluates the agent's decision layer (intent classification, tool selection,
 * escalation routing) against predefined scenarios. Runs against a given
 * provider — the deterministic demo provider by default so results are
 * reproducible with no network or API key.
 */
export async function evaluateCases(
  cases: EvalCase[],
  provider?: LLMProvider,
): Promise<EvalCaseResult[]> {
  const p = getLLMProviderForTest(provider);
  const results: EvalCaseResult[] = [];

  for (const c of cases) {
    const started = performance.now();
    const intent = await p.classifyIntent(c.input, []);
    const decision = await p.planStep({
      intent,
      customerMessage: c.input,
      history: [],
      toolResults: [],
      sources: [],
    });
    const latencyMs = Math.round(performance.now() - started);

    const actualTool = decision.type === "tool_call" ? decision.tool : null;
    const actualEscalate =
      decision.type === "escalate" || actualTool === "escalate_to_human";

    const intentMatch = intent.intent === c.expectedIntent;
    const toolMatch = c.expectedTool
      ? actualTool === c.expectedTool
      : c.expectedTool === undefined;
    const escalateMatch = c.expectedEscalate === undefined
      ? true
      : actualEscalate === c.expectedEscalate;

    const passed = intentMatch && toolMatch && escalateMatch;

    results.push({
      name: c.name,
      category: c.category,
      input: c.input,
      expectedIntent: c.expectedIntent,
      actualIntent: intent.intent,
      expectedTool: c.expectedTool ?? null,
      actualTool,
      expectedEscalate: c.expectedEscalate ?? false,
      actualEscalate,
      intentMatch,
      toolMatch,
      escalateMatch,
      passed,
      latencyMs,
    });
  }

  return results;
}

/**
 * Measures RAG retrieval success: for every case that should consult the
 * knowledge base, verify that semantic retrieval actually returns one or more
 * relevant chunks from the seeded knowledge base. Runs against the live DB.
 */
export async function evaluateRagRetrieval(
  orgId: string,
  cases: EvalCase[],
): Promise<{ total: number; success: number }> {
  const ragCases = cases.filter((c) => c.expectedTool === RAG_TOOL);
  let success = 0;
  for (const c of ragCases) {
    try {
      const { chunks } = await retrieveChunks(orgId, c.input);
      if (chunks.length > 0) success += 1;
    } catch {
      // a retrieval error counts as a failure for this case
    }
  }
  return { total: ragCases.length, success };
}

export function aggregateMetrics(
  results: EvalCaseResult[],
  rag: { total: number; success: number },
  provider: LLMProvider,
): EvalRunMetrics {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const intentCorrect = results.filter((r) => r.intentMatch).length;
  const toolCases = results.filter((r) => r.expectedTool !== null);
  const toolCorrect = toolCases.filter((r) => r.toolMatch).length;
  const escCases = results.filter((r) => r.expectedEscalate !== undefined);
  const escCorrect = escCases.filter((r) => r.escalateMatch).length;

  const unsupportedCases = results.filter((r) => r.category === "unsupported");
  const unsupportedHandled = unsupportedCases.filter(
    (r) => !r.actualTool || !DATA_TOOLS.has(r.actualTool),
  ).length;

  const avgLatencyMs = Math.round(
    results.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, total),
  );

  const promptTokens = provider.usage?.promptTokens ?? 0;
  const completionTokens = provider.usage?.completionTokens ?? 0;
  const totalTokens = promptTokens + completionTokens;
  const estimatedCostUsd = estimateCost(process.env.OPENAI_MODEL ?? "gpt-4o-mini", promptTokens, completionTokens);

  return {
    total,
    passed,
    failed: total - passed,
    intentAccuracy: round(intentCorrect / Math.max(1, total)),
    toolAccuracy: round(toolCorrect / Math.max(1, toolCases.length)),
    escalationAccuracy: round(escCorrect / Math.max(1, escCases.length)),
    ragSuccessRate: rag.total > 0 ? round(rag.success / rag.total) : null,
    unsupportedHandlingRate:
      unsupportedCases.length > 0 ? round(unsupportedHandled / unsupportedCases.length) : null,
    avgLatencyMs,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    provider: provider.name,
    mode: provider.isDemo ? "demo" : "live",
  };
}

/** Transparent cost estimate from actual token usage. Rates are labelled estimates. */
function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const rates: Record<string, { input: number; output: number }> = {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4o": { input: 2.5, output: 10 },
  };
  const r = rates[model] ?? { input: 0.15, output: 0.6 };
  const costUsd = (promptTokens / 1_000_000) * r.input + (completionTokens / 1_000_000) * r.output;
  return Number(costUsd.toFixed(6));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function runAndPersistEval(
  orgId: string,
  cases: EvalCase[],
  provider?: LLMProvider,
) {
  const p = getLLMProviderForTest(provider);

  const run = await prisma.evaluationRun.create({
    data: {
      orgId,
      name: `Evaluation ${new Date().toLocaleString()}`,
      provider: p.name,
      status: "RUNNING",
      totalCases: cases.length,
    },
  });

  const results = await evaluateCases(cases, p);
  const rag = await evaluateRagRetrieval(orgId, cases);
  const metrics = aggregateMetrics(results, rag, p);

  await prisma.$transaction(
    results.map((r) =>
      prisma.evaluationCase.create({
        data: {
          runId: run.id,
          orgId,
          name: r.name,
          category: r.category,
          input: r.input,
          expectedIntent: r.expectedIntent,
          expectedTool: r.expectedTool,
          expectedEscalate: r.expectedEscalate,
          actual: JSON.stringify(r),
          status: r.passed ? "PASSED" : "FAILED",
          latencyMs: r.latencyMs,
          costUsd: 0,
        },
      }),
    ),
  );

  await prisma.evaluationRun.update({
    where: { id: run.id },
    data: {
      status: "COMPLETED",
      passedCases: metrics.passed,
      metrics: JSON.stringify(metrics),
      completedAt: new Date(),
    },
  });

  return { run, metrics, results };
}
