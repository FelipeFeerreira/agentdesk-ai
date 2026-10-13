import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { applyRefund } from "./refunds";

let orgId: string;
let conversationId: string;

function refund(orderNumber: string, amountCents: number) {
  return prisma.$transaction((tx) => applyRefund(tx, { orgId, orderNumber, amountCents }));
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "Refund Rules Org", slug: `refund-rules-${Date.now()}`, settings: "{}" },
  });
  orgId = org.id;
  const customer = await prisma.customer.create({ data: { orgId, name: "R", externalId: "refund-rules-c" } });
  const conversation = await prisma.conversation.create({ data: { orgId, customerId: customer.id, channel: "WEB" } });
  conversationId = conversation.id;
  await prisma.order.createMany({
    data: [
      { orgId, customerId: customer.id, orderNumber: "7001", status: "PROCESSING", totalCents: 10000, placedAt: new Date(), items: "[]" },
      { orgId, customerId: customer.id, orderNumber: "7002", status: "CANCELLED", totalCents: 5000, placedAt: new Date(), items: "[]" },
      { orgId, customerId: customer.id, orderNumber: "7003", status: "PROCESSING", totalCents: 1000, placedAt: new Date(), items: "[]" },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("applyRefund", () => {
  it("applies a partial refund and reports the remaining balance", async () => {
    const r = await refund("7001", 3000);
    expect(r.ok).toBe(true);
    expect(r.refundedCents).toBe(3000);
    expect(r.remainingCents).toBe(7000);
    expect(r.status).toBe("PROCESSING");
  });

  it("marks the order REFUNDED once the full balance is refunded", async () => {
    const r = await refund("7001", 7000);
    expect(r.ok).toBe(true);
    expect(r.refundedCents).toBe(10000);
    expect(r.status).toBe("REFUNDED");
  });

  it("rejects a refund on a cancelled order", async () => {
    const r = await refund("7002", 100);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cancelled/i);
  });

  it("rejects a missing order without leaking existence", async () => {
    const r = await refund("9999", 100);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No order found/i);
  });

  it("prevents concurrent refunds from exceeding the order total", async () => {
    const [a, b] = await Promise.all([refund("7003", 800), refund("7003", 800)]);
    expect([a, b].filter((r) => r.ok).length).toBe(1);

    const order = await prisma.order.findUnique({
      where: { orgId_orderNumber: { orgId, orderNumber: "7003" } },
    });
    expect(order!.refundedCents).toBeLessThanOrEqual(order!.totalCents);
  });
});

describe("escalation decision transition", () => {
  it("only one concurrent decision wins the OPEN -> decided transition", async () => {
    const escalation = await prisma.escalation.create({
      data: { orgId, conversationId, reason: "r", aiSummary: "s", status: "OPEN" },
    });
    const [a, b] = await Promise.all([
      prisma.escalation.updateMany({ where: { id: escalation.id, status: "OPEN" }, data: { status: "APPROVED" } }),
      prisma.escalation.updateMany({ where: { id: escalation.id, status: "OPEN" }, data: { status: "REJECTED" } }),
    ]);
    expect([a.count, b.count].filter((c) => c === 1).length).toBe(1);
  });
});
