import { prisma } from "@/lib/db";
import type { Channel } from "@prisma/client";
import { handleCustomerMessage } from "@/lib/ai/agent";
import type { AgentResult } from "@/lib/ai/agent";

export interface IncomingMessage {
  orgId: string;
  channel: Channel;
  /** Stable identifier of the sender on that channel (phone number, visitor id). */
  channelUserId: string;
  content: string;
  /** Idempotency key (e.g. WhatsApp message id). */
  idempotencyKey?: string;
  /** Optional customer metadata to attach when creating a new customer. */
  name?: string;
  email?: string;
  phone?: string;
}

export interface IncomingResult {
  duplicate: boolean;
  conversationId: string;
  result: AgentResult | null;
}

/**
 * Unified message ingestion shared by Web Chat and WhatsApp.
 * Handles idempotency, customer mapping, and conversation resolution before
 * delegating to the AI agent.
 */
export async function handleIncomingMessage(
  input: IncomingMessage,
): Promise<IncomingResult> {
  // 1) Idempotency — protect against duplicate webhook deliveries.
  if (input.idempotencyKey) {
    const duplicate = await prisma.message.findFirst({
      where: { metadata: { contains: `"idempotencyKey":"${input.idempotencyKey}"` } },
    });
    if (duplicate) {
      return { duplicate: true, conversationId: duplicate.conversationId, result: null };
    }
  }

  // 2) Resolve or create the customer.
  let customer = await prisma.customer.findFirst({
    where: input.channel === "WHATSAPP"
      ? { orgId: input.orgId, whatsappId: input.channelUserId }
      : { orgId: input.orgId, externalId: input.channelUserId },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        orgId: input.orgId,
        ...(input.channel === "WHATSAPP"
          ? { whatsappId: input.channelUserId, phone: input.channelUserId }
          : { externalId: input.channelUserId }),
        name: input.name ?? "Web visitor",
        email: input.email,
      },
    });
  }

  // 3) Resolve or create an open conversation.
  let conversation = await prisma.conversation.findFirst({
    where: {
      orgId: input.orgId,
      customerId: customer.id,
      channel: input.channel,
      status: { notIn: ["RESOLVED"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        orgId: input.orgId,
        customerId: customer.id,
        channel: input.channel,
        status: "AI_ACTIVE",
      },
    });
  }

  // 4) Attach idempotency key to the message metadata via the agent's own write.
  //    (The agent creates the message; we store the key by patching after.)
  const result = await handleCustomerMessage({
    orgId: input.orgId,
    customerId: customer.id,
    conversationId: conversation.id,
    channel: input.channel,
    message: input.content,
  });

  if (input.idempotencyKey) {
    const last = await prisma.message.findFirst({
      where: { conversationId: conversation.id, role: "CUSTOMER" },
      orderBy: { createdAt: "desc" },
    });
    if (last && !(JSON.parse(last.metadata || "{}") as Record<string, unknown>).idempotencyKey) {
      await prisma.message.update({
        where: { id: last.id },
        data: { metadata: JSON.stringify({ idempotencyKey: input.idempotencyKey, channel: input.channel }) },
      });
    }
  }

  return { duplicate: false, conversationId: conversation.id, result };
}

export function extractWebchatId(): string {
  return `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
