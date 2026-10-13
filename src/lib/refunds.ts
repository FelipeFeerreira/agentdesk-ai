import { z } from "zod";
import type { Prisma } from "@prisma/client";

/**
 * A refund side effect against an order. Without a payment gateway this updates
 * LOCAL state only (a simulation) — it never moves real money.
 */
export const refundActionSchema = z.object({
  action: z.literal("refund"),
  orderNumber: z.string().trim().min(1).max(64),
  amountCents: z.number().int().positive(),
});
export type RefundAction = z.infer<typeof refundActionSchema>;

export interface RefundOutcome {
  ok: boolean;
  error?: string;
  orderId?: string;
  refundedCents?: number;
  remainingCents?: number;
  status?: string;
}

/**
 * Apply a (possibly partial) refund atomically with optimistic concurrency.
 *
 * MUST run inside a transaction. Validates order existence, status, and the
 * remaining balance, then updates only when the balance is unchanged — so two
 * concurrent refunds can never exceed the order total.
 */
export async function applyRefund(
  tx: Prisma.TransactionClient,
  input: { orgId: string; orderNumber: string; amountCents: number; customerId?: string },
): Promise<RefundOutcome> {
  const order = await tx.order.findUnique({
    where: { orgId_orderNumber: { orgId: input.orgId, orderNumber: input.orderNumber } },
  });
  if (!order) return { ok: false, error: `No order found with number "${input.orderNumber}".` };
  if (input.customerId && order.customerId !== input.customerId) {
    return { ok: false, error: "Order does not belong to this customer." };
  }
  if (order.status === "CANCELLED") {
    return { ok: false, error: `Order ${order.orderNumber} is cancelled and cannot be refunded.` };
  }

  const remaining = order.totalCents - order.refundedCents;
  if (remaining <= 0) {
    return { ok: false, error: `Order ${order.orderNumber} is already fully refunded.` };
  }
  if (input.amountCents > remaining) {
    return {
      ok: false,
      error: `Refund exceeds the remaining balance of ${(remaining / 100).toFixed(2)} ${order.currency}.`,
    };
  }

  const newRefunded = order.refundedCents + input.amountCents;
  const newStatus = newRefunded >= order.totalCents ? "REFUNDED" : order.status;

  const res = await tx.order.updateMany({
    where: { id: order.id, refundedCents: order.refundedCents },
    data: { refundedCents: newRefunded, status: newStatus },
  });
  if (res.count === 0) {
    return { ok: false, error: "Order was modified concurrently; please retry." };
  }

  return {
    ok: true,
    orderId: order.id,
    refundedCents: newRefunded,
    remainingCents: order.totalCents - newRefunded,
    status: newStatus,
  };
}
