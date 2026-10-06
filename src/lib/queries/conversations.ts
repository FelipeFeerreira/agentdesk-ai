import { prisma } from "@/lib/db";
import type { ConversationStatus } from "@prisma/client";

export async function getConversations(orgId: string, status?: string) {
  return prisma.conversation.findMany({
    where: { orgId, ...(status && status !== "all" ? { status: status as ConversationStatus } : {}) },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function getConversationDetail(orgId: string, id: string) {
  return prisma.conversation.findFirst({
    where: { orgId, id },
    include: {
      customer: true,
      owner: true,
      messages: { orderBy: { createdAt: "asc" } },
      toolCalls: { orderBy: { createdAt: "asc" } },
      lead: true,
      tickets: true,
      escalations: { orderBy: { createdAt: "desc" } },
    },
  });
}
