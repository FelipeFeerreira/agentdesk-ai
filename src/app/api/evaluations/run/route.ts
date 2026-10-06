import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { evalCases } from "@/lib/eval/cases";
import { runAndPersistEval } from "@/lib/eval/evaluator";
import { getLLMProvider } from "@/lib/ai/providers";

export async function POST() {
  const user = await requireUser();
  const provider = getLLMProvider();
  const { run, metrics, results } = await runAndPersistEval(user.orgId, evalCases, provider);
  return NextResponse.json({
    ok: true,
    runId: run.id,
    metrics,
    total: results.length,
    provider: metrics.provider,
    mode: metrics.mode,
  });
}
