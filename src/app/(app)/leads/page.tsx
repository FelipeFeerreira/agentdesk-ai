import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Cell, Row, Table } from "@/components/ui/table";
import { Badge, leadStatusTone } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";

export default async function LeadsPage() {
  const user = await requireUser();
  const leads = await prisma.lead.findMany({
    where: { orgId: user.orgId },
    include: { customer: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Leads"
        description="AI-qualified sales leads with transparent scoring."
      />
      <Card className="overflow-hidden">
        <Table headers={["Lead", "Company", "Score", "Status", "Budget", "Updated"]}>
          {leads.map((l) => {
            const st = leadStatusTone(l.status);
            return (
              <Row key={l.id}>
                <Cell>
                  <div className="font-medium text-ink-900">{l.name ?? l.customer.name}</div>
                  <div className="text-xs text-ink-400">{l.email}</div>
                </Cell>
                <Cell className="text-ink-600">{l.company ?? "—"}</Cell>
                <Cell>
                  {l.score != null ? (
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-ink-900 px-1.5 text-xs font-semibold text-white">
                      {l.score}
                    </span>
                  ) : (
                    "—"
                  )}
                </Cell>
                <Cell>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </Cell>
                <Cell className="text-ink-600">{l.budgetRange ?? "—"}</Cell>
                <Cell className="text-ink-500">{formatRelative(l.updatedAt)}</Cell>
              </Row>
            );
          })}
        </Table>
        {leads.length === 0 && (
          <p className="px-5 py-12 text-center text-sm text-ink-400">
            No leads yet. Try the web chat demo with a sales inquiry.
          </p>
        )}
      </Card>
    </>
  );
}
