import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { handleCustomerMessage } from "@/lib/ai/agent";
import { audit } from "@/lib/observability/audit";

const replySchema = z.object({
  content: z.string().trim().min(1).max(4000),
  returnToAi: z.boolean().optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Message content is required." }, { status: 400 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Persist the human agent's message.
  await prisma.message.create({
    data: {
      conversationId: id,
      role: "HUMAN",
      content: parsed.data.content,
    },
  });

  await prisma.conversation.update({
    where: { id },
    data: {
      status: parsed.data.returnToAi ? "AI_ACTIVE" : "HUMAN_ACTIVE",
      ownerUserId: user.userId,
    },
  });

  // If the operator wants to hand back to the AI, run the agent on their reply
  // so the AI continues the conversation.
  if (parsed.data.returnToAi) {
    await handleCustomerMessage({
      orgId: user.orgId,
      customerId: conversation.customerId,
      conversationId: id,
      channel: conversation.channel,
      message: `[human agent reply] ${parsed.data.content}`,
    });
  }

  await audit(user.orgId, {
    event: "conversation.human_reply",
    integration: "CORE",
    conversationId: id,
    status: "SUCCESS",
  });

  return NextResponse.json({ ok: true });
}
