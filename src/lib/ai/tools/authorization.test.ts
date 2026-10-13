import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTool } from "./index";
import { prisma } from "@/lib/db";
import { defaultSettings, serializeSettings } from "@/lib/settings";
import type { ToolContext } from "../types";

// These tests toggle DEMO_MODE; run sequentially within the file.
describe("order ownership (connected mode)", () => {
  let ctxOwner: ToolContext;
  let ctxOther: ToolContext;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "Authz Org", slug: `authz-${Date.now()}`, settings: serializeSettings(defaultSettings) },
    });
    const owner = await prisma.customer.create({ data: { orgId: org.id, name: "Owner", externalId: "authz-owner" } });
    const other = await prisma.customer.create({ data: { orgId: org.id, name: "Other", externalId: "authz-other" } });
    await prisma.order.create({
      data: { orgId: org.id, customerId: owner.id, orderNumber: "9001", status: "PROCESSING", totalCents: 5000, placedAt: new Date(), items: "[]" },
    });
    const convOwner = await prisma.conversation.create({ data: { orgId: org.id, customerId: owner.id, channel: "WEB" } });
    const convOther = await prisma.conversation.create({ data: { orgId: org.id, customerId: other.id, channel: "WEB" } });
    ctxOwner = { orgId: org.id, organization: org, customer: owner, conversationId: convOwner.id };
    ctxOther = { orgId: org.id, organization: org, customer: other, conversationId: convOther.id };
  });

  afterAll(async () => {
    delete process.env.DEMO_MODE;
    await prisma.$disconnect();
  });

  it("in demo mode the seeded fixtures are shared (walkthrough)", async () => {
    process.env.DEMO_MODE = "true";
    const res = await getTool("get_order_status")!.execute({ orderNumber: "9001" }, ctxOther);
    expect(res.ok).toBe(true);
  });

  it("in connected mode the owner can read the order", async () => {
    process.env.DEMO_MODE = "false";
    const res = await getTool("get_order_status")!.execute({ orderNumber: "9001" }, ctxOwner);
    expect(res.ok).toBe(true);
  });

  it("in connected mode another customer cannot read or refund the order", async () => {
    process.env.DEMO_MODE = "false";
    const read = await getTool("get_order_status")!.execute({ orderNumber: "9001" }, ctxOther);
    expect(read.ok).toBe(false);
    expect(read.error).toContain("No order found"); // no existence leak

    const refund = await getTool("refund_order")!.execute({ orderNumber: "9001", amountCents: 100 }, ctxOther);
    expect(refund.ok).toBe(false);

    // The order must be untouched.
    const order = await prisma.order.findUnique({ where: { orgId_orderNumber: { orgId: ctxOwner.orgId, orderNumber: "9001" } } });
    expect(order?.status).toBe("PROCESSING");
  });

  it("rejects refunds exceeding the order total", async () => {
    process.env.DEMO_MODE = "false";
    const res = await getTool("refund_order")!.execute({ orderNumber: "9001", amountCents: 999_999 }, ctxOwner);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/exceeds the order total/i);
  });
});
