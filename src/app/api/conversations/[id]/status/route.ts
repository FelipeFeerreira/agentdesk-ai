import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { audit } from "@/lib/observability/audit";

const schema = z.object({
  status: z.enum(["HUMAN_ACTIVE", "RESOLVED", "AI_ACTIVE"]),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await ctx.params;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  await prisma.conversation.update({
    where: { id },
    data: {
      status: parsed.data.status,
      ownerUserId: parsed.data.status === "HUMAN_ACTIVE" ? user.userId : conversation.ownerUserId,
      ...(parsed.data.status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
    },
  });

  await audit(user.orgId, {
    event: `conversation.status.${parsed.data.status.toLowerCase()}`,
    integration: "CORE",
    conversationId: id,
    status: "SUCCESS",
  });

  return NextResponse.json({ ok: true });
}
