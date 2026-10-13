import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { handleIncomingMessage } from "./inbox";
import { defaultSettings, serializeSettings } from "@/lib/settings";

let orgId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "Inbox Org", slug: `inbox-${Date.now()}`, settings: serializeSettings(defaultSettings) },
  });
  orgId = org.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("idempotent ingestion (web chat)", () => {
  it("processes intentionally repeated messages with different send ids", async () => {
    const a = await handleIncomingMessage({
      orgId,
      channel: "WEB",
      channelUserId: "repeat-visitor",
      content: "What is your refund policy?",
      clientMessageId: "send-a",
    });
    const b = await handleIncomingMessage({
      orgId,
      channel: "WEB",
      channelUserId: "repeat-visitor",
      content: "What is your refund policy?",
      clientMessageId: "send-b",
    });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
    expect(a.result?.assistantContent).toBeTruthy();
    expect(b.result?.assistantContent).toBeTruthy();
  });

  it("replays the same send id with a consistent result (no re-run)", async () => {
    const first = await handleIncomingMessage({
      orgId,
      channel: "WEB",
      channelUserId: "replay-visitor",
      content: "Where is order #4582?",
      clientMessageId: "replay-1",
    });
    const replay = await handleIncomingMessage({
      orgId,
      channel: "WEB",
      channelUserId: "replay-visitor",
      content: "Where is order #4582?",
      clientMessageId: "replay-1",
    });
    expect(first.duplicate).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(replay.result?.assistantContent).toBe(first.result?.assistantContent);
  });
});

describe("conversation state machine", () => {
  it("records the message but does not answer while a human owns the conversation", async () => {
    const customer = await prisma.customer.create({
      data: { orgId, name: "Human-owned", externalId: "human-owned-visitor" },
    });
    const conversation = await prisma.conversation.create({
      data: { orgId, customerId: customer.id, channel: "WEB", status: "HUMAN_ACTIVE" },
    });

    const result = await handleIncomingMessage({
      orgId,
      channel: "WEB",
      channelUserId: "human-owned-visitor",
      content: "are you there?",
      clientMessageId: "human-1",
    });

    expect(result.result).toBeNull();

    const messages = await prisma.message.findMany({ where: { conversationId: conversation.id } });
    expect(messages.some((m) => m.role === "CUSTOMER")).toBe(true);
    expect(messages.some((m) => m.role === "ASSISTANT")).toBe(false);

    const after = await prisma.conversation.findUnique({ where: { id: conversation.id } });
    expect(after?.status).toBe("HUMAN_ACTIVE");
  });
});
