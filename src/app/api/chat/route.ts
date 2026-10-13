import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleIncomingMessage } from "@/lib/messaging/inbox";
import { audit } from "@/lib/observability/audit";
import { rateLimit, clientKey } from "@/lib/security/rate-limit";

const schema = z.object({
  visitorId: z.string().trim().min(6).max(64),
  clientMessageId: z.string().trim().min(8).max(64),
  message: z.string().trim().min(1).max(4000),
  name: z.string().trim().max(120).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

const RATE_LIMIT = 20; // requests
const RATE_WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request) {
  // Enforce a real byte limit regardless of Content-Length.
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }

  // Abuse protection keyed by client IP only (visitor id is not trusted).
  const limit = rateLimit(clientKey(request, "chat"), RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many messages. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return NextResponse.json({ error: "No workspace configured." }, { status: 500 });

  try {
    const started = Date.now();
    const result = await handleIncomingMessage({
      orgId: org.id,
      channel: "WEB",
      channelUserId: parsed.data.visitorId,
      content: parsed.data.message,
      name: parsed.data.name,
      email: parsed.data.email || undefined,
      clientMessageId: parsed.data.clientMessageId,
    });

    // Same send id with different content is a conflict, not a replay.
    if (result.conflict) {
      return NextResponse.json({ error: "This send id was already used with different content." }, { status: 409 });
    }
    if (result.inProgress) {
      return NextResponse.json({ error: "This message is already being processed." }, { status: 409 });
    }

    if (!result.duplicate) {
      await audit(org.id, {
        event: "webchat.message",
        integration: "CORE",
        conversationId: result.conversationId ?? undefined,
        status: "SUCCESS",
        durationMs: Date.now() - started,
      });
    }

    return NextResponse.json({
      reply: result.result?.assistantContent ?? null,
      conversationId: result.conversationId,
      escalated: result.result?.escalated ?? false,
      duplicate: result.duplicate,
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
