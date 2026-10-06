import { prisma } from "@/lib/db";

export async function getOverviewMetrics(orgId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    conversationsToday,
    totalConversations,
    resolvedConversations,
    humanEscalations,
    qualifiedLeads,
    openTickets,
    failedWorkflows,
    needsReview,
    avgToolDuration,
    toolCallsThisMonth,
  ] = await Promise.all([
    prisma.conversation.count({ where: { orgId, createdAt: { gte: today } } }),
    prisma.conversation.count({ where: { orgId } }),
    prisma.conversation.count({ where: { orgId, status: "RESOLVED" } }),
    prisma.escalation.count({ where: { orgId, status: { in: ["OPEN", "APPROVED"] } } }),
    prisma.lead.count({ where: { orgId, status: "QUALIFIED" } }),
    prisma.ticket.count({ where: { orgId, status: { in: ["OPEN", "IN_PROGRESS", "PENDING"] } } }),
    prisma.workflowRun.count({ where: { orgId, status: { in: ["FAILED", "DEAD"] } } }),
    prisma.conversation.count({ where: { orgId, status: "NEEDS_HUMAN_REVIEW" } }),
    prisma.toolCall.aggregate({
      where: { conversation: { orgId } },
      _avg: { durationMs: true },
    }),
    prisma.toolCall.count({ where: { conversation: { orgId }, createdAt: { gte: startOfMonth } } }),
  ]);

  const aiResolutionRate =
    totalConversations > 0
      ? Math.round((resolvedConversations / totalConversations) * 100)
      : 0;

  // Transparent demo-mode cost model: an explicit estimate, not a claim of
  // real API spend. Real spend would come from the provider's usage API.
  const estimatedCostUsd = Number((toolCallsThisMonth * 0.002).toFixed(2));

  return {
    conversationsToday,
    totalConversations,
    aiResolutionRate,
    humanEscalations,
    qualifiedLeads,
    openTickets,
    failedWorkflows,
    needsReview,
    averageResponseMs: Math.round(avgToolDuration._avg.durationMs ?? 0),
    estimatedCostUsd,
  };
}

export async function getConversationStatusBreakdown(orgId: string) {
  const statuses = [
    "AI_ACTIVE",
    "NEEDS_HUMAN_REVIEW",
    "ESCALATED",
    "RESOLVED",
    "WAITING",
    "HUMAN_ACTIVE",
  ] as const;
  const rows = await prisma.conversation.groupBy({
    by: ["status"],
    where: { orgId },
    _count: { _all: true },
  });
  const map = new Map(rows.map((r) => [r.status, r._count._all]));
  return statuses.map((s) => ({ status: s, count: map.get(s) ?? 0 }));
}

export async function getRecentActivity(orgId: string) {
  return prisma.auditLog.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
}
