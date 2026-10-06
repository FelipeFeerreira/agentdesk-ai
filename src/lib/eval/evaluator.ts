import { prisma } from "@/lib/db";
import { getLLMProviderForTest } from "@/lib/ai/providers";
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
  avgLatencyMs: number;
  estimatedCostUsd: number;
}

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

export function aggregateMetrics(results: EvalCaseResult[]): EvalRunMetrics {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const intentCorrect = results.filter((r) => r.intentMatch).length;
  const toolCases = results.filter((r) => r.expectedTool !== null);
  const toolCorrect = toolCases.filter((r) => r.toolMatch).length;
  const escCases = results.filter((r) => r.expectedEscalate !== undefined);
  const escCorrect = escCases.filter((r) => r.escalateMatch).length;
  const avgLatencyMs = Math.round(
    results.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, total),
  );

  return {
    total,
    passed,
    failed: total - passed,
    intentAccuracy: round(intentCorrect / Math.max(1, total)),
    toolAccuracy: round(toolCorrect / Math.max(1, toolCases.length)),
    escalationAccuracy: round(escCorrect / Math.max(1, escCases.length)),
    avgLatencyMs,
    // Transparent demo cost model — no real provider spend.
    estimatedCostUsd: Number((total * 0.001).toFixed(3)),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function runAndPersistEval(
  orgId: string,
  cases: EvalCase[],
  provider?: LLMProvider,
) {
  const run = await prisma.evaluationRun.create({
    data: { orgId, name: `Evaluation ${new Date().toLocaleString()}`, status: "RUNNING", totalCases: cases.length },
  });

  const results = await evaluateCases(cases, provider);
  const metrics = aggregateMetrics(results);

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
