import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Cell, Row, Table } from "@/components/ui/table";
import { Badge, ticketStatusTone } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";

const priorityTone: Record<string, "neutral" | "danger" | "warning" | "success" | "info"> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
};

export default async function TicketsPage() {
  const user = await requireUser();
  const tickets = await prisma.ticket.findMany({
    where: { orgId: user.orgId },
    include: { customer: true, assignee: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader title="Tickets" description="Support tickets created by the AI agent." />
      <Card className="overflow-hidden">
        <Table headers={["Subject", "Customer", "Priority", "Status", "Assignee", "Created"]}>
          {tickets.map((t) => {
            const st = ticketStatusTone(t.status);
            return (
              <Row key={t.id}>
                <Cell>
                  <div className="font-medium text-ink-900">{t.subject}</div>
                </Cell>
                <Cell className="text-ink-600">{t.customer.name}</Cell>
                <Cell>
                  <Badge tone={priorityTone[t.priority]}>{t.priority.toLowerCase()}</Badge>
                </Cell>
                <Cell>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </Cell>
                <Cell className="text-ink-600">{t.assignee?.name ?? "—"}</Cell>
                <Cell className="text-ink-500">{formatRelative(t.createdAt)}</Cell>
              </Row>
            );
          })}
        </Table>
        {tickets.length === 0 && (
          <p className="px-5 py-12 text-center text-sm text-ink-400">No tickets yet.</p>
        )}
      </Card>
    </>
  );
}
