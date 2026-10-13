import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import type { Channel } from "@prisma/client";
import { handleCustomerMessage } from "@/lib/ai/agent";
import type { AgentResult } from "@/lib/ai/agent";

export interface IncomingMessage {
  orgId: string;
  channel: Channel;
  /** Stable sender identifier on the channel (phone number, visitor ref). */
  channelUserId: string;
  content: string;
  /**
   * The channel/consumer message id (WhatsApp message id, web send id). Combined
   * with org + channel + sender it forms the stable receipt key.
   */
  clientMessageId?: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface IncomingResult {
  /** The same receipt was already completed → the stored reply is returned. */
  duplicate: boolean;
  /** The same receipt key was seen with different content → caller should 409. */
  conflict: boolean;
  /** The same receipt is currently being processed (concurrent duplicate). */
  inProgress: boolean;
  conversationId: string | null;
  result: AgentResult | null;
}

function contentHash(text: string): string {
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex");
}

function receiptKey(orgId: string, channel: Channel, senderRef: string, messageId: string): string {
  return `${orgId}:${channel}:${senderRef}:${messageId}`;
}

function replayResult(content: string): AgentResult {
  return {
    assistantMessageId: "",
    assistantContent: content,
    intent: "general_support",
    confidence: 0,
    toolCalls: [],
    escalated: false,
    status: "AI_ACTIVE",
    sources: [],
  };
}

function parseMeta(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/**
 * Unified message ingestion shared by Web Chat and WhatsApp.
 *
 * Idempotency is keyed on a stable receipt (`org:channel:sender:messageId`)
 * checked BEFORE any conversation is resolved, so:
 *  - a replay never creates a new conversation, even after the original was resolved;
 *  - the same receipt with different content is a conflict (never reprocessed);
 *  - a completed receipt returns the exact reply stored for it (explicit link).
 *
 * The conversation state machine applies after receipt resolution: the AI only
 * answers AI_ACTIVE conversations; otherwise the message is recorded for a human.
 */
export async function handleIncomingMessage(
  input: IncomingMessage,
): Promise<IncomingResult> {
  const hash = contentHash(input.content);
  const key = input.clientMessageId
    ? receiptKey(input.orgId, input.channel, input.channelUserId, input.clientMessageId)
    : null;

  // 1) Receipt resolution (no conversation required).
  let retryConversationId: string | null = null;
  if (key) {
    const existing = await prisma.message.findFirst({ where: { clientMessageId: key } });
    if (existing) {
      const meta = parseMeta(existing.metadata);
      if (typeof meta.contentHash === "string" && meta.contentHash !== hash) {
        return { duplicate: false, conflict: true, inProgress: false, conversationId: existing.conversationId, result: null };
      }
      if (existing.inboundStatus === "PENDING") {
        return { duplicate: true, conflict: false, inProgress: true, conversationId: existing.conversationId, result: null };
      }
      if (existing.inboundStatus === "FAILED") {
        // Recoverable: reuse the row and retry below.
        retryConversationId = existing.conversationId;
      } else {
        const reply = existing.replyMessageId
          ? await prisma.message.findUnique({ where: { id: existing.replyMessageId } })
          : null;
        return {
          duplicate: true,
          conflict: false,
          inProgress: false,
          conversationId: existing.conversationId,
          result: reply ? replayResult(reply.content) : null,
        };
      }
    }
  }

  // 2) Resolve or create the customer atomically (unique identity per org+channel).
  const customer =
    input.channel === "WHATSAPP"
      ? await prisma.customer.upsert({
          where: { orgId_whatsappId: { orgId: input.orgId, whatsappId: input.channelUserId } },
          update: {},
          create: { orgId: input.orgId, whatsappId: input.channelUserId, phone: input.channelUserId, name: "WhatsApp customer" },
        })
      : await prisma.customer.upsert({
          where: { orgId_externalId: { orgId: input.orgId, externalId: input.channelUserId } },
          update: {},
          create: { orgId: input.orgId, externalId: input.channelUserId, name: input.name ?? "Web visitor", email: input.email },
        });

  // 3) Resolve or create an open conversation (or reuse the retried receipt's).
  let conversation = retryConversationId
    ? await prisma.conversation.findUnique({ where: { id: retryConversationId } })
    : await prisma.conversation.findFirst({
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
      data: { orgId: input.orgId, customerId: customer.id, channel: input.channel, status: "AI_ACTIVE" },
    });
  }
  const conversationId = conversation.id;

  // 4) Persist the inbound message with its receipt + PENDING state.
  const metadata = JSON.stringify({ channel: input.channel, contentHash: hash });
  let inboundMessageId: string;
  try {
    if (key && retryConversationId) {
      const existing = await prisma.message.findFirst({ where: { clientMessageId: key } });
      inboundMessageId = existing!.id;
      await prisma.message.update({
        where: { id: inboundMessageId },
        data: { inboundStatus: "PENDING", replyMessageId: null },
      });
    } else {
      const created = await prisma.message.create({
        data: {
          conversationId,
          role: "CUSTOMER",
          content: input.content,
          clientMessageId: key,
          inboundStatus: "PENDING",
          metadata,
        },
      });
      inboundMessageId = created.id;
    }
  } catch (e) {
    if (isUniqueViolation(e) && key) {
      // Concurrent duplicate raced past the check — re-resolve the receipt.
      const existing = await prisma.message.findFirst({ where: { clientMessageId: key } });
      if (existing?.inboundStatus === "COMPLETED" && existing.replyMessageId) {
        const reply = await prisma.message.findUnique({ where: { id: existing.replyMessageId } });
        return { duplicate: true, conflict: false, inProgress: false, conversationId: existing.conversationId, result: reply ? replayResult(reply.content) : null };
      }
      return { duplicate: true, conflict: false, inProgress: true, conversationId: existing?.conversationId ?? conversationId, result: null };
    }
    throw e;
  }

  // 5) State machine: only AI_ACTIVE conversations are answered by the model.
  if (conversation.status !== "AI_ACTIVE") {
    await prisma.message.update({
      where: { id: inboundMessageId },
      data: { inboundStatus: "COMPLETED" },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return { duplicate: false, conflict: false, inProgress: false, conversationId, result: null };
  }

  // 6) Run the agent (the inbound message is already persisted).
  try {
    const result = await handleCustomerMessage({
      orgId: input.orgId,
      customerId: customer.id,
      conversationId,
      channel: input.channel,
      message: input.content,
      alreadyPersisted: true,
    });
    await prisma.message.update({
      where: { id: inboundMessageId },
      data: { inboundStatus: "COMPLETED", replyMessageId: result.assistantMessageId },
    });
    return { duplicate: false, conflict: false, inProgress: false, conversationId, result };
  } catch (e) {
    await prisma.message.update({
      where: { id: inboundMessageId },
      data: { inboundStatus: "FAILED", metadata: JSON.stringify({ channel: input.channel, contentHash: hash, error: e instanceof Error ? e.message : "unknown" }) },
    });
    throw e;
  }
}

export function extractWebchatId(): string {
  return `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
