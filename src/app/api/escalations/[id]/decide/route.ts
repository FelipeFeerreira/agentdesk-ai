import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { audit } from "@/lib/observability/audit";

const schema = z.object({ decision: z.enum(["approve", "reject"]) });

interface ProposedAction {
  action?: string;
  orderNumber?: string;
  amountCents?: number;
}

/**
 * Approve or reject a pending escalation.
 *
 * Safety:
 *  - only OWNER/ADMIN may decide a sensitive action;
 *  - the decision is tied to the escalation's stored `proposedAction` (no
 *    ambiguous tool-call lookup);
 *  - the OPEN → decided transition is atomic (`updateMany` guarded on OPEN), so
 *    two concurrent approvals cannot both execute the side effect;
 *  - the refund is applied only after winning that transition.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(["OWNER", "ADMIN"]);
  const { id } = await ctx.params;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }
  const approve = parsed.data.decision === "approve";

  const escalation = await prisma.escalation.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!escalation) {
    return NextResponse.json({ error: "Escalation not found." }, { status: 404 });
  }

  // Atomic state transition: only one caller can move it out of OPEN.
  const transition = await prisma.escalation.updateMany({
    where: { id, orgId: user.orgId, status: "OPEN" },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      decidedByUserId: user.userId,
      decidedAt: new Date(),
    },
  });
  if (transition.count === 0) {
    return NextResponse.json({ error: "Escalation already decided." }, { status: 409 });
  }

  // Execute the approved action exactly once.
  if (approve) {
    const proposed = (escalation.proposedAction
      ? JSON.parse(escalation.proposedAction)
      : null) as ProposedAction | null;

    if (proposed?.action === "refund" && proposed.orderNumber && proposed.amountCents) {
      const order = await prisma.order.findUnique({
        where: { orgId_orderNumber: { orgId: user.orgId, orderNumber: proposed.orderNumber } },
      });
      if (!order) {
        await audit(user.orgId, {
          event: "escalation.refund.failed",
          integration: "CORE",
          conversationId: escalation.conversationId,
          status: "FAILED",
          metadata: { escalationId: id, error: "order not found" },
        });
      } else if (order.status === "REFUNDED") {
        // Idempotent: already refunded — nothing more to do.
      } else if (proposed.amountCents > order.totalCents) {
        await audit(user.orgId, {
          event: "escalation.refund.failed",
          integration: "CORE",
          conversationId: escalation.conversationId,
          status: "FAILED",
          metadata: { escalationId: id, error: "amount exceeds order total" },
        });
      } else {
        await prisma.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
      }
    }
  }

  await prisma.conversation.update({
    where: { id: escalation.conversationId },
    data: { status: "HUMAN_ACTIVE", ownerUserId: user.userId },
  });

  await audit(user.orgId, {
    event: approve ? "escalation.approved" : "escalation.rejected",
    integration: "CORE",
    conversationId: escalation.conversationId,
    status: "SUCCESS",
    metadata: { escalationId: id, decidedBy: user.userId },
  });

  return NextResponse.json({ ok: true });
}
