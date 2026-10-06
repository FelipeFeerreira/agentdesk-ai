import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Cell, Row, Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { RunEvalButton } from "./run-eval-button";
import Link from "next/link";
import type { EvalRunMetrics } from "@/lib/eval/evaluator";

export default async function EvaluationsPage() {
  const user = await requireUser();
  const runs = await prisma.evaluationRun.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <>
      <PageHeader
        title="Evaluations"
        description="Measured AI agent performance — no fabricated metrics."
        actions={<RunEvalButton />}
      />

      {runs.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <h3 className="text-sm font-semibold text-ink-900">No evaluations yet</h3>
            <p className="mt-1 max-w-sm text-sm text-ink-500">
              Run the evaluation suite to measure intent accuracy, tool selection and escalation
              correctness across {runs.length} predefined scenarios.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table headers={["Run", "Provider", "Status", "Passed", "Intent acc.", "Tool acc.", "RAG", "Avg latency", "Date"]}>
            {runs.map((r) => {
              const m = safeParse<EvalRunMetrics>(r.metrics);
              return (
                <Row key={r.id}>
                  <Cell>
                    <Link href={`/evaluations/${r.id}`} className="font-medium text-brand-600 hover:underline">
                      {r.name}
                    </Link>
                  </Cell>
                  <Cell>
                    <Badge tone={r.provider === "demo" ? "warning" : "success"}>
                      {r.provider === "demo" ? "Demo" : "Live"}
                    </Badge>
                  </Cell>
                  <Cell>
                    <Badge tone={r.status === "COMPLETED" ? "success" : r.status === "FAILED" ? "danger" : "info"}>
                      {r.status.toLowerCase()}
                    </Badge>
                  </Cell>
                  <Cell className="text-ink-700">
                    {r.passedCases}/{r.totalCases}
                  </Cell>
                  <Cell className="text-ink-700">{m ? `${Math.round(m.intentAccuracy * 100)}%` : "—"}</Cell>
                  <Cell className="text-ink-700">{m ? `${Math.round(m.toolAccuracy * 100)}%` : "—"}</Cell>
                  <Cell className="text-ink-700">
                    {m?.ragSuccessRate != null ? `${Math.round(m.ragSuccessRate * 100)}%` : "—"}
                  </Cell>
                  <Cell className="text-ink-600">{m ? `${m.avgLatencyMs}ms` : "—"}</Cell>
                  <Cell className="text-ink-500">{formatDate(r.createdAt)}</Cell>
                </Row>
              );
            })}
          </Table>
        </Card>
      )}
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
