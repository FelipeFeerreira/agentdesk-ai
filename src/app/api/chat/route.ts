import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleIncomingMessage } from "@/lib/messaging/inbox";
import { audit } from "@/lib/observability/audit";

const schema = z.object({
  visitorId: z.string().trim().min(6).max(64),
  message: z.string().trim().min(1).max(4000),
  name: z.string().trim().max(120).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }

  // Resolve the demo organization (single-tenant demo workspace).
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    return NextResponse.json({ error: "No workspace configured." }, { status: 500 });
  }

  try {
    const started = Date.now();
    const result = await handleIncomingMessage({
      orgId: org.id,
      channel: "WEB",
      channelUserId: parsed.data.visitorId,
      content: parsed.data.message,
      name: parsed.data.name,
      email: parsed.data.email || undefined,
      idempotencyKey: `web:${parsed.data.visitorId}:${parsed.data.message.length}:${parsed.data.message.slice(0, 32)}`,
    });

    if (result.duplicate) {
      return NextResponse.json({ reply: null, duplicate: true });
    }

    await audit(org.id, {
      event: "webchat.message",
      integration: "CORE",
      conversationId: result.conversationId,
      status: "SUCCESS",
      durationMs: Date.now() - started,
    });

    return NextResponse.json({
      reply: result.result?.assistantContent ?? "",
      conversationId: result.conversationId,
      escalated: result.result?.escalated ?? false,
    });
  } catch (e) {
    await audit(org.id, {
      event: "webchat.message",
      integration: "CORE",
      status: "FAILED",
      metadata: { error: e instanceof Error ? e.message : "unknown" },
    });
    return NextResponse.json(
      { error: "The AI agent hit an error. Please try again." },
      { status: 500 },
    );
  }
}
