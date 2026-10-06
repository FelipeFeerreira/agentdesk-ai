import { requireUser } from "@/lib/auth/guards";
import {
  getConversationStatusBreakdown,
  getOverviewMetrics,
  getRecentActivity,
} from "@/lib/queries/overview";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, auditStatusTone } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { DemoBanner } from "@/components/demo-banner";

export default async function OverviewPage() {
  const user = await requireUser();
  const orgId = user.orgId;

  const [metrics, breakdown, activity] = await Promise.all([
    getOverviewMetrics(orgId),
    getConversationStatusBreakdown(orgId),
    getRecentActivity(orgId),
  ]);

  const cards = [
    { label: "Conversations today", value: String(metrics.conversationsToday), hint: `${metrics.totalConversations} total` },
    { label: "AI resolution rate", value: `${metrics.aiResolutionRate}%`, hint: "of conversations resolved" },
    { label: "Needs human review", value: String(metrics.needsReview), hint: `${metrics.humanEscalations} open escalations` },
    { label: "Qualified leads", value: String(metrics.qualifiedLeads), hint: "scored & synced" },
    { label: "Open tickets", value: String(metrics.openTickets), hint: "awaiting action" },
    { label: "Failed workflows", value: String(metrics.failedWorkflows), hint: "in dead letter" },
    { label: "Avg. tool latency", value: `${metrics.averageResponseMs}ms`, hint: "across tool calls" },
    { label: "Est. AI cost (demo)", value: `$${metrics.estimatedCostUsd}`, hint: "explicit estimate" },
  ];

  const maxCount = Math.max(1, ...breakdown.map((b) => b.count));

  return (
    <>
      <PageHeader
        title="Overview"
        description="Operational view of your AI-powered customer operations."
      />
      <DemoBanner />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent>
              <p className="text-[13px] font-medium text-ink-500">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">{c.value}</p>
              <p className="mt-0.5 text-xs text-ink-400">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Conversations by status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {breakdown.map((b) => (
                <div key={b.status}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Badge tone={statusTone(b.status)}>{b.status.replace(/_/g, " ").toLowerCase()}</Badge>
                    </span>
                    <span className="font-medium text-ink-700">{b.count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${(b.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-ink-100">
              {activity.map((a) => {
                const t = auditStatusTone(a.status);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-ink-700">{a.event}</p>
                      <p className="text-xs text-ink-400">{formatRelative(a.createdAt)}</p>
                    </div>
                    <Badge tone={t.tone}>{t.label}</Badge>
                  </li>
                );
              })}
              {activity.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-ink-400">No activity yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

import { conversationStatusTone } from "@/components/ui/badge";
function statusTone(s: string) {
  return conversationStatusTone(s).tone;
}
