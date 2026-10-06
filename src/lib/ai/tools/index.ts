import { z } from "zod";
import { prisma } from "@/lib/db";
import { retrieveChunks } from "@/lib/rag/vectorstore";
import { getCRMProvider } from "@/lib/crm";
import { parseSettings } from "@/lib/settings";
import type { ToolDefinition, ToolResult } from "../types";
import type { LeadStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function err(message: string): ToolResult {
  return { ok: false, error: message };
}

function ok(data: unknown, citations?: string[]): ToolResult {
  return { ok: true, data, citations };
}

const orderNumberSchema = z.string().trim().min(1).max(64);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const tools: ToolDefinition[] = [
  {
    name: "get_customer_profile",
    description:
      "Retrieve the current customer's profile including name, email, company and their order history summary.",
    schema: z.object({}),
    execute: async (_args, ctx) => {
      const orders = await prisma.order.findMany({
        where: { customerId: ctx.customer.id },
        orderBy: { placedAt: "desc" },
        take: 10,
      });
      return ok({
        id: ctx.customer.id,
        name: ctx.customer.name,
        email: ctx.customer.email,
        phone: ctx.customer.phone,
        company: ctx.customer.company,
        companySize: ctx.customer.companySize,
        orders: orders.map((o) => ({
          orderNumber: o.orderNumber,
          status: o.status,
          totalCents: o.totalCents,
          currency: o.currency,
          placedAt: o.placedAt.toISOString(),
        })),
      });
    },
  },
  {
    name: "get_order_status",
    description:
      "Look up an order by its order number and return its current status and details. Returns an error if the order does not exist.",
    schema: z.object({ orderNumber: orderNumberSchema }),
    execute: async (args, ctx) => {
      const { orderNumber } = args as { orderNumber: string };
      const order = await prisma.order.findUnique({
        where: { orgId_orderNumber: { orgId: ctx.orgId, orderNumber } },
        include: { customer: true },
      });
      if (!order) return err(`No order found with number "${orderNumber}".`);
      return ok({
        orderNumber: order.orderNumber,
        status: order.status,
        totalCents: order.totalCents,
        currency: order.currency,
        placedAt: order.placedAt.toISOString(),
        items: JSON.parse(order.items),
        customerName: order.customer.name,
      });
    },
  },
  {
    name: "search_knowledge_base",
    description:
      "Search the company knowledge base (policies, docs, FAQ) for relevant information to answer a customer question.",
    schema: z.object({ query: z.string().trim().min(2).max(500) }),
    execute: async (args, ctx) => {
      const { query } = args as { query: string };
      const { chunks } = await retrieveChunks(ctx.orgId, query);
      if (chunks.length === 0) {
        return err("No relevant information found in the knowledge base.");
      }
      return ok(
        chunks.map((c) => ({
          chunkId: c.chunkId,
          documentTitle: c.documentTitle,
          content: c.content,
          score: c.score,
        })),
        chunks.map((c) => c.documentTitle),
      );
    },
  },
  {
    name: "create_support_ticket",
    description:
      "Create a support ticket for an issue that requires follow-up or a human team.",
    schema: z.object({
      subject: z.string().trim().min(3).max(200),
      description: z.string().trim().min(3).max(2000),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    }),
    execute: async (args, ctx) => {
      const a = args as { subject: string; description: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" };
      const ticket = await prisma.ticket.create({
        data: {
          orgId: ctx.orgId,
          customerId: ctx.customer.id,
          conversationId: ctx.conversationId,
          subject: a.subject,
          description: a.description,
          priority: a.priority,
        },
      });
      return ok({ ticketId: ticket.id, subject: ticket.subject });
    },
  },
  {
    name: "qualify_lead",
    description:
      "Qualify a sales lead from collected information and compute a transparent qualification score and status.",
    schema: z.object({
      name: z.string().trim().max(120).optional(),
      email: z.string().email().optional(),
      company: z.string().trim().max(120).optional(),
      companySize: z.number().int().positive().optional(),
      problem: z.string().trim().max(1000).optional(),
      solution: z.string().trim().max(1000).optional(),
      budgetRange: z.string().trim().max(60).optional(),
      timeline: z.string().trim().max(60).optional(),
    }),
    execute: async (args, ctx) => {
      const a = args as {
        name?: string;
        email?: string;
        company?: string;
        companySize?: number;
        problem?: string;
        solution?: string;
        budgetRange?: string;
        timeline?: string;
      };
      const score = scoreLead(a);
      const status: LeadStatus =
        score >= 6 ? "QUALIFIED" : score >= 4 ? "NEEDS_MORE_INFO" : "NEW";

      const existing = await prisma.lead.findUnique({
        where: { conversationId: ctx.conversationId },
      });

      const lead = existing
        ? await prisma.lead.update({
            where: { id: existing.id },
            data: {
              name: a.name ?? existing.name,
              email: a.email ?? existing.email,
              company: a.company ?? existing.company,
              companySize: a.companySize ?? existing.companySize,
              problem: a.problem ?? existing.problem,
              solution: a.solution ?? existing.solution,
              budgetRange: a.budgetRange ?? existing.budgetRange,
              timeline: a.timeline ?? existing.timeline,
              score,
              status,
              qualifiedAt: status === "QUALIFIED" ? new Date() : existing.qualifiedAt,
            },
          })
        : await prisma.lead.create({
            data: {
              orgId: ctx.orgId,
              customerId: ctx.customer.id,
              conversationId: ctx.conversationId,
              name: a.name,
              email: a.email,
              company: a.company,
              companySize: a.companySize,
              problem: a.problem,
              solution: a.solution,
              budgetRange: a.budgetRange,
              timeline: a.timeline,
              score,
              status,
              qualifiedAt: status === "QUALIFIED" ? new Date() : null,
            },
          });

      return ok({
        leadId: lead.id,
        score,
        status,
        breakdown: leadScoreBreakdown(a),
      });
    },
  },
  {
    name: "create_crm_contact",
    description:
      "Create or update a CRM contact (e.g. HubSpot) with the customer's details.",
    schema: z.object({
      email: z.string().email(),
      firstName: z.string().trim().max(80).optional(),
      lastName: z.string().trim().max(80).optional(),
      phone: z.string().trim().max(40).optional(),
      company: z.string().trim().max(120).optional(),
    }),
    execute: async (args, ctx) => {
      const a = args as {
        email: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        company?: string;
      };
      const crm = getCRMProvider();
      const res = await crm.upsertContact(ctx.orgId, {
        email: a.email,
        firstName: a.firstName,
        lastName: a.lastName,
        phone: a.phone,
        company: a.company,
      });
      if (!res.ok) return err(res.error ?? "CRM contact upsert failed.");
      return ok({ contactId: res.id, demo: res.demo });
    },
  },
  {
    name: "create_crm_deal",
    description:
      "Create a CRM deal (e.g. HubSpot deal) for a qualified sales opportunity.",
    schema: z.object({
      name: z.string().trim().min(2).max(200),
      amount: z.number().positive().optional(),
      stage: z.string().trim().max(60).optional(),
    }),
    execute: async (args, ctx) => {
      const a = args as { name: string; amount?: number; stage?: string };
      const crm = getCRMProvider();
      const res = await crm.createDeal(ctx.orgId, {
        name: a.name,
        amount: a.amount,
        stage: a.stage,
      });
      if (!res.ok) return err(res.error ?? "CRM deal creation failed.");
      return ok({ dealId: res.id, demo: res.demo });
    },
  },
  {
    name: "book_meeting",
    description:
      "Schedule a meeting with a sales or support team member. Returns a proposed time and confirmation reference.",
    schema: z.object({
      purpose: z.string().trim().min(2).max(200).optional(),
      preferredTime: z.string().trim().max(120).optional(),
    }),
    execute: async (args, _ctx) => {
      const a = args as { purpose?: string; preferredTime?: string };
      const proposed =
        a.preferredTime ?? "next available business day at 10:00";
      return ok({
        meetingId: `mtg_${Date.now().toString(36)}`,
        purpose: a.purpose ?? "Introductory call",
        proposedTime: proposed,
        demo: true,
      });
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Escalate the conversation to a human agent with a concise reason and decision summary.",
    schema: z.object({
      reason: z.string().trim().min(2).max(500),
      summary: z.string().trim().min(2).max(1000),
    }),
    execute: async (args, ctx) => {
      const a = args as { reason: string; summary: string };
      const escalation = await prisma.escalation.create({
        data: {
          orgId: ctx.orgId,
          conversationId: ctx.conversationId,
          reason: a.reason,
          aiSummary: a.summary,
          status: "OPEN",
        },
      });
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: "NEEDS_HUMAN_REVIEW", escalationReason: a.reason },
      });
      return ok({ escalationId: escalation.id });
    },
  },
  {
    name: "refund_order",
    description:
      "Process a refund for an order. Refunds above the configured approval threshold require human approval.",
    sensitive: true,
    schema: z.object({
      orderNumber: orderNumberSchema,
      amountCents: z.number().int().positive(),
      reason: z.string().trim().min(2).max(1000).optional(),
    }),
    execute: async (args, ctx) => {
      const a = args as { orderNumber: string; amountCents: number; reason?: string };
      const order = await prisma.order.findUnique({
        where: { orgId_orderNumber: { orgId: ctx.orgId, orderNumber: a.orderNumber } },
      });
      if (!order) return err(`No order found with number "${a.orderNumber}".`);

      const settings = parseSettings(ctx.organization.settings);
      const threshold = settings.business.refundApprovalThresholdUsd * 100;

      if (a.amountCents > threshold) {
        return {
          ok: false,
          error: "Refund exceeds approval threshold.",
          data: {
            requiresApproval: true,
            orderNumber: a.orderNumber,
            amountCents: a.amountCents,
            thresholdCents: threshold,
          },
        };
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { status: "REFUNDED" },
      });
      return ok({
        orderNumber: a.orderNumber,
        refundedCents: a.amountCents,
        status: "REFUNDED",
      });
    },
  },
];

// ---------------------------------------------------------------------------
// Lead scoring (transparent rules)
// ---------------------------------------------------------------------------

export function scoreLead(a: {
  companySize?: number;
  email?: string;
  company?: string;
  problem?: string;
  solution?: string;
  budgetRange?: string;
  timeline?: string;
}): number {
  let score = 0;
  if (a.email) score += 1;
  if (a.company) score += 1;
  if (a.companySize && a.companySize >= 10) score += 1;
  if (a.problem && a.problem.length > 10) score += 1;
  if (a.solution && /automation|ai|customer support|support|agent/i.test(a.solution)) score += 2;
  if (a.budgetRange && !/none|no budget/i.test(a.budgetRange)) score += 1;
  if (a.timeline) score += 1;
  return score;
}

export function leadScoreBreakdown(a: Record<string, unknown>): Record<string, number> {
  return {
    hasEmail: a.email ? 1 : 0,
    hasCompany: a.company ? 1 : 0,
    companySizeOk: a.companySize && (a.companySize as number) >= 10 ? 1 : 0,
    problemDescribed: a.problem && String(a.problem).length > 10 ? 1 : 0,
    solutionMatches: a.solution && /automation|ai|customer support|support|agent/i.test(String(a.solution)) ? 2 : 0,
    budgetKnown: a.budgetRange && !/none|no budget/i.test(String(a.budgetRange)) ? 1 : 0,
    timelineKnown: a.timeline ? 1 : 0,
  };
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}
