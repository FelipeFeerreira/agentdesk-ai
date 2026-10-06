import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getConversations } from "@/lib/queries/conversations";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Cell, Row, Table } from "@/components/ui/table";
import { Badge, channelTone, conversationStatusTone } from "@/components/ui/badge";
import { formatRelative, initials } from "@/lib/utils";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const { status } = await searchParams;
  const conversations = await getConversations(user.orgId, status);

  const filters = [
    { value: "all", label: "All" },
    { value: "AI_ACTIVE", label: "AI Active" },
    { value: "NEEDS_HUMAN_REVIEW", label: "Needs Review" },
    { value: "ESCALATED", label: "Escalated" },
    { value: "RESOLVED", label: "Resolved" },
  ];

  return (
    <>
      <PageHeader
        title="Conversations"
        description="Your customer support inbox across all channels."
      />
      <div className="mb-4 flex gap-1.5">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/conversations" : `/conversations?status=${f.value}`}
            className={
              (status ?? "all") === f.value
                ? "rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white"
                : "rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <Table headers={["Customer", "Channel", "Intent", "Status", "Last activity"]}>
          {conversations.map((c) => {
            const st = conversationStatusTone(c.status);
            const ch = channelTone(c.channel);
            return (
              <Row key={c.id}>
                <Cell>
                  <Link href={`/conversations/${c.id}`} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                      {initials(c.customer.name)}
                    </span>
                    <span className="font-medium text-ink-900">{c.customer.name}</span>
                  </Link>
                </Cell>
                <Cell>
                  <Badge tone={ch.tone}>{ch.label}</Badge>
                </Cell>
                <Cell className="capitalize text-ink-600">
                  {c.intent?.replace(/_/g, " ") ?? "—"}
                </Cell>
                <Cell>
                  <Badge tone={st.tone} dot>
                    {st.label}
                  </Badge>
                </Cell>
                <Cell className="text-ink-500">{formatRelative(c.updatedAt)}</Cell>
              </Row>
            );
          })}
        </Table>
        {conversations.length === 0 && (
          <p className="px-5 py-12 text-center text-sm text-ink-400">No conversations found.</p>
        )}
      </Card>
    </>
  );
}
