import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";

/**
 * Returns a web visitor's conversation messages (including human-agent replies)
 * so the customer chat can reflect handoff activity. Authorized by matching the
 * visitor id to the conversation's customer — no cross-visitor access.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const visitorId = searchParams.get("visitorId")?.trim() ?? "";
  const conversationId = searchParams.get("conversationId")?.trim() ?? "";

  if (!visitorId || !conversationId) {
    return NextResponse.json({ error: "Missing parameters." }, { status: 400 });
  }

  const limit = rateLimit(clientKey(request, "chat-poll"), 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const customer = await prisma.customer.findFirst({ where: { externalId: visitorId } });
  if (!customer) return NextResponse.json({ messages: [] });

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, customerId: customer.id, channel: "WEB" },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
