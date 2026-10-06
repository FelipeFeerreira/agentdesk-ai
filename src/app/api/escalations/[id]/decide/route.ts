import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { audit } from "@/lib/observability/audit";

const schema = z.object({
  decision: z.enum(["approve", "reject"]),
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
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  const escalation = await prisma.escalation.findFirst({
    where: { id, orgId: user.orgId },
    include: { conversation: { include: { toolCalls: true } } },
  });
  if (!escalation) {
    return NextResponse.json({ error: "Escalation not found." }, { status: 404 });
  }
  if (escalation.status !== "OPEN") {
    return NextResponse.json({ error: "Escalation already decided." }, { status: 409 });
  }

  const approve = parsed.data.decision === "approve";

  if (approve) {
    // If the escalation was caused by a refund over the approval threshold,
    // approving it executes the pending refund.
    const pendingRefund = escalation.conversation.toolCalls.find(
      (t) =>
        t.name === "refund_order" &&
        t.status === "FAILED" &&
        (JSON.parse(t.result ?? "{}") as { data?: { requiresApproval?: boolean } })
          .data?.requiresApproval,
    );
    if (pendingRefund) {
      const args = JSON.parse(pendingRefund.arguments) as {
        orderNumber: string;
        amountCents: number;
      };
      const order = await prisma.order.findUnique({
        where: { orgId_orderNumber: { orgId: user.orgId, orderNumber: args.orderNumber } },
      });
      if (order) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "REFUNDED" },
        });
      }
    }
  }

  await prisma.escalation.update({
    where: { id },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      decidedByUserId: user.userId,
      decidedAt: new Date(),
    },
  });

  await prisma.conversation.update({
    where: { id: escalation.conversationId },
    data: { status: "HUMAN_ACTIVE", ownerUserId: user.userId },
  });

  await audit(user.orgId, {
    event: approve ? "escalation.approved" : "escalation.rejected",
    integration: "CORE",
    conversationId: escalation.conversationId,
    status: "SUCCESS",
    metadata: { escalationId: id },
  });

  return NextResponse.json({ ok: true });
}
