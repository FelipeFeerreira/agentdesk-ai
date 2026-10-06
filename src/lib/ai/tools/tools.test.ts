import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { getTool, tools } from "./index";
import { prisma } from "@/lib/db";
import { defaultSettings, serializeSettings } from "@/lib/settings";
import type { ToolContext } from "../types";

// ---------------------------------------------------------------------------
// Schema validation — every tool validates its arguments with a Zod schema.
// ---------------------------------------------------------------------------

describe("tool schema validation", () => {
  it("get_order_status requires a non-empty orderNumber string", () => {
    const t = getTool("get_order_status")!;
    expect(t.schema.safeParse({ orderNumber: "4582" }).success).toBe(true);
    expect(t.schema.safeParse({}).success).toBe(false);
    expect(t.schema.safeParse({ orderNumber: "" }).success).toBe(false);
    expect(t.schema.safeParse({ orderNumber: 123 }).success).toBe(false);
  });

  it("refund_order requires a positive integer amountCents", () => {
    const t = getTool("refund_order")!;
    expect(t.schema.safeParse({ orderNumber: "4582", amountCents: 100 }).success).toBe(true);
    expect(t.schema.safeParse({ orderNumber: "4582", amountCents: -1 }).success).toBe(false);
    expect(t.schema.safeParse({ orderNumber: "4582", amountCents: 0 }).success).toBe(false);
    expect(t.schema.safeParse({ orderNumber: "4582", amountCents: 1.5 }).success).toBe(false);
  });

  it("create_support_ticket validates subject and description length", () => {
    const t = getTool("create_support_ticket")!;
    expect(t.schema.safeParse({ subject: "Refund issue", description: "please help" }).success).toBe(true);
    expect(t.schema.safeParse({ subject: "x", description: "please help" }).success).toBe(false);
    expect(t.schema.safeParse({ subject: "ok", description: "" }).success).toBe(false);
  });

  it("qualify_lead validates email format", () => {
    const t = getTool("qualify_lead")!;
    expect(t.schema.safeParse({ email: "a@b.com" }).success).toBe(true);
    expect(t.schema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("escalate_to_human requires a reason and summary", () => {
    const t = getTool("escalate_to_human")!;
    expect(t.schema.safeParse({ reason: "Customer request", summary: "wants a human" }).success).toBe(true);
    expect(t.schema.safeParse({ reason: "", summary: "" }).success).toBe(false);
  });

  it("every registered tool has a schema and a description", () => {
    for (const t of tools) {
      expect(t.name).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(10);
      expect(typeof t.schema.safeParse).toBe("function");
      expect(typeof t.execute).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// Tool execution — real DB lookups against the isolated test database.
// ---------------------------------------------------------------------------

describe("tool execution (customer/order lookup)", () => {
  let ctx: ToolContext;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: "Tool Test Org",
        slug: `tool-test-${Date.now()}`,
        settings: serializeSettings(defaultSettings),
      },
    });
    const customer = await prisma.customer.create({
      data: {
        orgId: org.id,
        name: "Test Customer",
        email: "test@example.com",
        externalId: "web_test_customer",
        company: "Test Co",
        companySize: 30,
      },
    });
    await prisma.order.createMany({
      data: [
        { orgId: org.id, customerId: customer.id, orderNumber: "4582", status: "PROCESSING", totalCents: 79900, placedAt: new Date(), items: "[]" },
        { orgId: org.id, customerId: customer.id, orderNumber: "4530", status: "DELIVERED", totalCents: 4900, placedAt: new Date(), items: "[]" },
      ],
    });
    const conversation = await prisma.conversation.create({
      data: { orgId: org.id, customerId: customer.id, channel: "WEB" },
    });

    ctx = { orgId: org.id, organization: org, customer, conversationId: conversation.id };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("get_order_status returns real order data for a known order", async () => {
    const result = await getTool("get_order_status")!.execute({ orderNumber: "4582" }, ctx);
    expect(result.ok).toBe(true);
    expect((result.data as { status: string }).status).toBe("PROCESSING");
    expect((result.data as { orderNumber: string }).orderNumber).toBe("4582");
    expect((result.data as { totalCents: number }).totalCents).toBe(79900);
  });

  it("get_order_status returns an error for an unknown order (no fabricated data)", async () => {
    const result = await getTool("get_order_status")!.execute({ orderNumber: "9999" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No order found");
  });

  it("get_customer_profile returns the customer and their order history", async () => {
    const result = await getTool("get_customer_profile")!.execute({}, ctx);
    expect(result.ok).toBe(true);
    const data = result.data as { email: string; orders: { orderNumber: string }[] };
    expect(data.email).toBe("test@example.com");
    expect(data.orders).toHaveLength(2);
  });
});

describe("tool execution (refund threshold + escalation)", () => {
  let ctx: ToolContext;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: "Refund Test Org",
        slug: `refund-test-${Date.now()}`,
        settings: serializeSettings(defaultSettings), // threshold $100 = 10000 cents
      },
    });
    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Refund Customer", email: "refund@example.com", externalId: "web_refund" },
    });
    await prisma.order.create({
      data: { orgId: org.id, customerId: customer.id, orderNumber: "4582", status: "PROCESSING", totalCents: 79900, placedAt: new Date(), items: "[]" },
    });
    const conversation = await prisma.conversation.create({
      data: { orgId: org.id, customerId: customer.id, channel: "WEB" },
    });
    ctx = { orgId: org.id, organization: org, customer, conversationId: conversation.id };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("refund above the approval threshold returns requiresApproval (no refund applied)", async () => {
    const result = await getTool("refund_order")!.execute(
      { orderNumber: "4582", amountCents: 50000 },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect((result.data as { requiresApproval: boolean }).requiresApproval).toBe(true);

    const order = await prisma.order.findUnique({
      where: { orgId_orderNumber: { orgId: ctx.orgId, orderNumber: "4582" } },
    });
    expect(order?.status).toBe("PROCESSING"); // unchanged
  });

  it("refund under the approval threshold is processed", async () => {
    const result = await getTool("refund_order")!.execute(
      { orderNumber: "4582", amountCents: 4900 },
      ctx,
    );
    expect(result.ok).toBe(true);

    const order = await prisma.order.findUnique({
      where: { orgId_orderNumber: { orgId: ctx.orgId, orderNumber: "4582" } },
    });
    expect(order?.status).toBe("REFUNDED");
  });

  it("escalate_to_human creates an escalation and flags the conversation", async () => {
    const result = await getTool("escalate_to_human")!.execute(
      { reason: "Customer requested a human", summary: "Wants to speak to a person." },
      ctx,
    );
    expect(result.ok).toBe(true);

    const conversation = await prisma.conversation.findUnique({ where: { id: ctx.conversationId } });
    expect(conversation?.status).toBe("NEEDS_HUMAN_REVIEW");

    const escalation = await prisma.escalation.findFirst({ where: { conversationId: ctx.conversationId } });
    expect(escalation?.reason).toBe("Customer requested a human");
  });
});
