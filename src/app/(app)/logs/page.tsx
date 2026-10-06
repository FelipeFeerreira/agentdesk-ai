import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Cell, Row, Table } from "@/components/ui/table";
import { Badge, auditStatusTone } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const { status } = await searchParams;
  const logs = await prisma.auditLog.findMany({
    where: {
      orgId: user.orgId,
      ...(status && status !== "all" ? { status: status as "SUCCESS" | "FAILED" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const filters = ["all", "SUCCESS", "FAILED", "RETRYING", "NEEDS_REVIEW"];

  return (
    <>
      <PageHeader
        title="Logs"
        description="Operational activity across AI, integrations and workflows."
      />
      <div className="mb-4 flex gap-1.5">
        {filters.map((f) => (
          <a
            key={f}
            href={f === "all" ? "/logs" : `/logs?status=${f}`}
            className={
              (status ?? "all") === f
                ? "rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white"
                : "rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
            }
          >
            {f === "all" ? "All" : f.toLowerCase()}
          </a>
        ))}
      </div>

      <Card className="overflow-hidden">
        <Table headers={["Timestamp", "Event", "Integration", "Status", "Duration", "Retries"]}>
          {logs.map((l) => {
            const st = auditStatusTone(l.status);
            return (
              <Row key={l.id}>
                <Cell className="whitespace-nowrap text-ink-500">{formatRelative(l.createdAt)}</Cell>
                <Cell className="font-mono text-xs text-ink-700">{l.event}</Cell>
                <Cell className="text-ink-600">{l.integration ?? "—"}</Cell>
                <Cell>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </Cell>
                <Cell className="text-ink-500">{l.durationMs != null ? `${l.durationMs}ms` : "—"}</Cell>
                <Cell className="text-ink-500">{l.retryCount || "—"}</Cell>
              </Row>
            );
          })}
        </Table>
        {logs.length === 0 && (
          <p className="px-5 py-12 text-center text-sm text-ink-400">No log entries found.</p>
        )}
      </Card>
    </>
  );
}
