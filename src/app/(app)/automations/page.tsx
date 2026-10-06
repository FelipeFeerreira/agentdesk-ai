import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cell, Row, Table } from "@/components/ui/table";
import { Badge, workflowStatusTone } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { RunJobsButton } from "./run-jobs-button";

export default async function AutomationsPage() {
  const user = await requireUser();
  const runs = await prisma.workflowRun.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Automations"
        description="Background workflows with retries, idempotency and dead-letter handling."
        actions={<RunJobsButton />}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workflow runs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table headers={["Type", "Status", "Attempts", "Last updated", "Error"]}>
              {runs.map((r) => {
                const st = workflowStatusTone(r.status);
                return (
                  <Row key={r.id}>
                    <Cell className="font-mono text-xs text-ink-700">{r.type.toLowerCase()}</Cell>
                    <Cell>
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </Cell>
                    <Cell className="text-ink-600">
                      {r.attempts}/{r.maxAttempts}
                    </Cell>
                    <Cell className="text-ink-500">{formatRelative(r.updatedAt)}</Cell>
                    <Cell className="max-w-[220px] truncate text-xs text-red-600">{r.error ?? ""}</Cell>
                  </Row>
                );
              })}
            </Table>
            {runs.length === 0 && (
              <p className="px-5 py-12 text-center text-sm text-ink-400">No workflow runs yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>n8n integration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-ink-600">
            <p>
              This project ships ready-to-import n8n workflows in{" "}
              <code className="rounded bg-ink-100 px-1 font-mono text-xs">n8n/workflows/</code>:
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>Qualified Lead → HubSpot Contact + Deal</li>
              <li>Support Escalation → Ticket + Slack notify</li>
              <li>Knowledge Base Update → ingestion endpoint</li>
              <li>Lead Follow-up → wait, check, notify</li>
            </ul>
            <p className="text-xs text-ink-400">
              In demo mode, automation events are recorded locally and labelled as simulated.
              Set <code className="rounded bg-ink-100 px-1 font-mono text-xs">N8N_WEBHOOK_URL</code>{" "}
              to dispatch real webhooks. See <code className="rounded bg-ink-100 px-1 font-mono text-xs">docs/n8n.md</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
