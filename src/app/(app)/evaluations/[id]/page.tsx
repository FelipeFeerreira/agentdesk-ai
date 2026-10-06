import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Cell, Row, Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { EvalRunMetrics } from "@/lib/eval/evaluator";

export default async function EvalRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const run = await prisma.evaluationRun.findFirst({
    where: { id, orgId: user.orgId },
    include: { cases: { orderBy: { name: "asc" } } },
  });
  if (!run) notFound();

  const metrics = safeParse<EvalRunMetrics>(run.metrics);

  return (
    <>
      <PageHeader
        title={run.name}
        description="Per-scenario results from the evaluation suite."
      />
      <div className="flex items-center gap-3">
        <Link href="/evaluations" className="text-sm text-ink-400 hover:text-ink-700">
          ← Evaluations
        </Link>
        <Badge tone={run.provider === "demo" ? "warning" : "success"}>
          {run.provider === "demo" ? "Demo (deterministic)" : "Live model"}
        </Badge>
      </div>

      {metrics && (
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Passed", value: `${run.passedCases}/${run.totalCases}` },
            { label: "Intent accuracy", value: `${Math.round(metrics.intentAccuracy * 100)}%` },
            { label: "Tool accuracy", value: `${Math.round(metrics.toolAccuracy * 100)}%` },
            { label: "Escalation accuracy", value: `${Math.round(metrics.escalationAccuracy * 100)}%` },
            {
              label: "RAG retrieval",
              value: metrics.ragSuccessRate != null ? `${Math.round(metrics.ragSuccessRate * 100)}%` : "—",
            },
            {
              label: "Unsupported handling",
              value: metrics.unsupportedHandlingRate != null ? `${Math.round(metrics.unsupportedHandlingRate * 100)}%` : "—",
            },
            { label: "Avg latency", value: `${metrics.avgLatencyMs}ms` },
            {
              label: "Tokens / est. cost",
              value: `${metrics.totalTokens} · $${metrics.estimatedCostUsd}`,
            },
          ].map((c) => (
            <Card key={c.label}>
              <div className="px-4 py-3">
                <p className="text-[13px] font-medium text-ink-500">{c.label}</p>
                <p className="mt-1 text-xl font-semibold text-ink-900">{c.value}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6 overflow-hidden">
        <Table headers={["Scenario", "Category", "Intent", "Tool", "Result"]}>
          {run.cases.map((c) => (
            <Row key={c.id}>
              <Cell className="font-mono text-xs text-ink-700">{c.name}</Cell>
              <Cell className="text-ink-600">{c.category.replace(/_/g, " ")}</Cell>
              <Cell className="text-ink-600">{(c.expectedIntent ?? "").replace(/_/g, " ")}</Cell>
              <Cell className="font-mono text-xs text-ink-600">{c.expectedTool ?? "—"}</Cell>
              <Cell>
                <Badge tone={c.status === "PASSED" ? "success" : "danger"}>
                  {c.status.toLowerCase()}
                </Badge>
              </Cell>
            </Row>
          ))}
        </Table>
      </Card>
    </>
  );
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
