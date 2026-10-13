import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { refundActionSchema, applyRefund } from "@/lib/refunds";
import { audit } from "@/lib/observability/audit";

const schema = z.object({ decision: z.enum(["approve", "reject"]) });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Approve or reject a pending escalation.
 *
 * - only OWNER/ADMIN may decide;
 * - the proposed action is validated (Zod + business rules) BEFORE any effect;
 * - the escalation transition and the local refund are ONE transaction, so a
 *   failure leaves the escalation OPEN (safe retry) and never approves without
 *   executing, or executes without approving.
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
    include: { conversation: { select: { customerId: true } } },
  });
  if (!escalation) {
    return NextResponse.json({ error: "Escalation not found." }, { status: 404 });
  }

  // Validate the proposed action up front (never act on a malformed action).
  let refundAction: { orderNumber: string; amountCents: number } | null = null;
  if (escalation.proposedAction) {
    let raw: unknown;
    try {
      raw = JSON.parse(escalation.proposedAction);
    } catch {
      return NextResponse.json({ error: "Escalation has a malformed proposed action." }, { status: 422 });
    }
    const actionParsed = refundActionSchema.safeParse(raw);
    if (!actionParsed.success) {
      return NextResponse.json({ error: "Escalation has an invalid proposed action." }, { status: 422 });
    }
    refundAction = { orderNumber: actionParsed.data.orderNumber, amountCents: actionParsed.data.amountCents };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const transition = await tx.escalation.updateMany({
        where: { id, orgId: user.orgId, status: "OPEN" },
        data: {
          status: approve ? "APPROVED" : "REJECTED",
          decidedByUserId: user.userId,
          decidedAt: new Date(),
        },
      });
      if (transition.count === 0) {
        throw new HttpError(409, "Escalation already decided.");
      }

      if (approve && refundAction) {
        const outcome = await applyRefund(tx, {
          orgId: user.orgId,
          orderNumber: refundAction.orderNumber,
          amountCents: refundAction.amountCents,
          customerId: escalation.conversation.customerId,
        });
        if (!outcome.ok) {
          throw new HttpError(422, outcome.error ?? "Refund could not be applied.");
        }
      }

      await tx.conversation.update({
        where: { id: escalation.conversationId },
        data: { status: "HUMAN_ACTIVE", ownerUserId: user.userId },
      });
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  await audit(user.orgId, {
    event: approve ? "escalation.approved" : "escalation.rejected",
    integration: "CORE",
    conversationId: escalation.conversationId,
    status: "SUCCESS",
    metadata: { escalationId: id, decidedBy: user.userId },
  });

  return NextResponse.json({ ok: true });
}
