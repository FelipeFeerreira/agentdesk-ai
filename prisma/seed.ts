/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { ingestDocument } from "../src/lib/rag/ingest";
import { seedDocuments } from "../src/lib/seed/documents";
import { defaultSettings } from "../src/lib/settings";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding AgentDesk AI demo data...");

  // Clear in dependency order (children first).
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.workflowRun.deleteMany(),
    prisma.escalation.deleteMany(),
    prisma.evaluationCase.deleteMany(),
    prisma.evaluationRun.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.toolCall.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.order.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.knowledgeChunk.deleteMany(),
    prisma.knowledgeDocument.deleteMany(),
    prisma.integration.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
  ]);

  const org = await prisma.organization.create({
    data: {
      name: "AgentDesk Demo",
      slug: "agentdesk-demo",
      settings: JSON.stringify(defaultSettings),
    },
  });

  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "admin@agentdesk.ai",
      passwordHash: await hashPassword("admin123"),
      name: "Demo Admin",
      role: "ADMIN",
    },
  });

  const agent = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "agent@agentdesk.ai",
      passwordHash: await hashPassword("agent123"),
      name: "Support Agent",
      role: "AGENT",
    },
  });

  // --- Integrations (all clearly-labelled DEMO mode) ---
  const integrationTypes = ["OPENAI", "HUBSPOT", "WHATSAPP", "N8N", "GOOGLE_DRIVE"] as const;
  for (const type of integrationTypes) {
    await prisma.integration.create({
      data: {
        orgId: org.id,
        type,
        mode: "DEMO",
        isConfigured: false,
        config: JSON.stringify({ demo: true }),
      },
    });
  }

  // --- Knowledge base ---
  for (const doc of seedDocuments) {
    try {
      await ingestDocument({
        orgId: org.id,
        title: doc.title,
        source: doc.source,
        type: doc.type,
        text: doc.content,
      });
      console.log(`  indexed: ${doc.title}`);
    } catch (e) {
      console.error(`  failed to index ${doc.title}:`, e);
    }
  }

  // --- Customers & orders ---
  const customerData = [
    {
      name: "Alice Morgan",
      email: "alice.morgan@example.com",
      externalId: "web_alice",
      whatsappId: "15550101",
      company: "Northwind Labs",
      companySize: 25,
      orders: [
        { orderNumber: "4582", status: "SHIPPED", totalCents: 12900 },
        { orderNumber: "4610", status: "PROCESSING", totalCents: 9900 },
      ],
    },
    {
      name: "Ben Carter",
      email: "ben.carter@example.com",
      externalId: "web_ben",
      whatsappId: "15550102",
      company: "Carter & Co",
      companySize: 8,
      orders: [{ orderNumber: "4530", status: "DELIVERED", totalCents: 4900 }],
    },
    {
      name: "Priya Shah",
      email: "priya.shah@example.com",
      externalId: "web_priya",
      whatsappId: "15550103",
      company: "Brightline Media",
      companySize: 60,
      orders: [{ orderNumber: "4701", status: "PROCESSING", totalCents: 79900 }],
    },
    {
      name: "Marcus Webb",
      email: "marcus.webb@example.com",
      externalId: "web_marcus",
      whatsappId: "15550104",
      company: "Webb Consulting",
      companySize: 4,
      orders: [],
    },
  ];

  const customers: Record<string, { id: string }> = {};
  for (const c of customerData) {
    const created = await prisma.customer.create({
      data: {
        orgId: org.id,
        name: c.name,
        email: c.email,
        externalId: c.externalId,
        whatsappId: c.whatsappId,
        company: c.company,
        companySize: c.companySize,
      },
    });
    customers[c.name] = { id: created.id };
    for (const o of c.orders) {
      await prisma.order.create({
        data: {
          orgId: org.id,
          customerId: created.id,
          orderNumber: o.orderNumber,
          status: o.status,
          totalCents: o.totalCents,
          currency: "USD",
          placedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
          items: JSON.stringify([{ name: "Growth plan", qty: 1, unitCents: o.totalCents }]),
        },
      });
    }
  }

  // --- Conversations (representative threads) ---
  const aliceId = customers["Alice Morgan"].id;

  // Conversation 1: order status — AI resolved.
  const c1 = await prisma.conversation.create({
    data: {
      orgId: org.id,
      customerId: aliceId,
      channel: "WEB",
      status: "AI_ACTIVE",
      intent: "order_status",
      aiConfidence: 0.97,
      tags: JSON.stringify(["order", "resolved-by-ai"]),
    },
  });
  await prisma.message.createMany({
    data: [
      { conversationId: c1.id, role: "CUSTOMER", content: "Where is order #4582?" },
      { conversationId: c1.id, role: "ASSISTANT", content: "Order 4582 is on its way and has been shipped. The order total is $129.00." },
    ],
  });
  await prisma.toolCall.create({
    data: {
      conversationId: c1.id,
      name: "get_order_status",
      arguments: JSON.stringify({ orderNumber: "4582" }),
      result: JSON.stringify({ ok: true, data: { orderNumber: "4582", status: "SHIPPED", totalCents: 12900, currency: "USD" } }),
      status: "SUCCESS",
      durationMs: 42,
    },
  });

  // Conversation 2: refund policy — RAG resolved with sources.
  const benId = customers["Ben Carter"].id;
  const c2 = await prisma.conversation.create({
    data: {
      orgId: org.id,
      customerId: benId,
      channel: "WHATSAPP",
      status: "RESOLVED",
      intent: "refund_policy",
      aiConfidence: 0.93,
      tags: JSON.stringify(["refund", "knowledge-base"]),
      resolvedAt: new Date(Date.now() - 2 * 3600 * 1000),
    },
  });
  await prisma.message.createMany({
    data: [
      { conversationId: c2.id, role: "CUSTOMER", content: "What is your refund policy?" },
      { conversationId: c2.id, role: "ASSISTANT", content: "AgentDesk offers refunds on subscription plans within 30 days of purchase... — From our Refund Policy" },
    ],
  });
  await prisma.toolCall.create({
    data: {
      conversationId: c2.id,
      name: "search_knowledge_base",
      arguments: JSON.stringify({ query: "refund policy" }),
      result: JSON.stringify({ ok: true, data: [{ documentTitle: "Refund Policy", content: "AgentDesk offers refunds on subscription plans within 30 days of purchase...", score: 0.71 }] }),
      status: "SUCCESS",
      durationMs: 88,
    },
  });

  // Conversation 3: high-value refund — escalated (human review).
  const priyaId = customers["Priya Shah"].id;
  const c3 = await prisma.conversation.create({
    data: {
      orgId: org.id,
      customerId: priyaId,
      channel: "WEB",
      status: "NEEDS_HUMAN_REVIEW",
      intent: "refund_request",
      aiConfidence: 0.9,
      escalationReason: "Refund amount exceeds approval threshold",
      tags: JSON.stringify(["refund", "escalated", "high-value"]),
    },
  });
  await prisma.message.createMany({
    data: [
      { conversationId: c3.id, role: "CUSTOMER", content: "I need a $500 refund for order #4701." },
      { conversationId: c3.id, role: "ASSISTANT", content: "That refund amount is above what I can approve automatically, so I've sent it to our team for review." },
    ],
  });
  await prisma.toolCall.createMany({
    data: [
      {
        conversationId: c3.id,
        name: "get_order_status",
        arguments: JSON.stringify({ orderNumber: "4701" }),
        result: JSON.stringify({ ok: true, data: { orderNumber: "4701", status: "PROCESSING", totalCents: 79900 } }),
        status: "SUCCESS",
        durationMs: 45,
      },
      {
        conversationId: c3.id,
        name: "refund_order",
        arguments: JSON.stringify({ orderNumber: "4701", amountCents: 50000 }),
        result: JSON.stringify({ ok: false, error: "Refund exceeds approval threshold.", data: { requiresApproval: true, amountCents: 50000, thresholdCents: 10000 } }),
        status: "FAILED",
        durationMs: 20,
      },
    ],
  });
  await prisma.escalation.create({
    data: {
      orgId: org.id,
      conversationId: c3.id,
      reason: "Refund amount exceeds approval threshold",
      aiSummary: "Customer requested a $500 refund for order #4701. The configured refund approval threshold is $100, so human approval is required.",
      status: "OPEN",
    },
  });

  // Conversation 4: human request — escalated.
  const marcusId = customers["Marcus Webb"].id;
  const c4 = await prisma.conversation.create({
    data: {
      orgId: org.id,
      customerId: marcusId,
      channel: "WHATSAPP",
      status: "ESCALATED",
      intent: "human_request",
      aiConfidence: 0.92,
      escalationReason: "Customer requested to speak to a human",
      tags: JSON.stringify(["human-handoff"]),
    },
  });
  await prisma.message.createMany({
    data: [
      { conversationId: c4.id, role: "CUSTOMER", content: "I want to speak to a human." },
      { conversationId: c4.id, role: "ASSISTANT", content: "I've connected your request with our team. A human agent will take over shortly." },
    ],
  });

  // Conversation 5: lead qualification in progress.
  const c5 = await prisma.conversation.create({
    data: {
      orgId: org.id,
      customerId: marcusId,
      channel: "WEB",
      status: "AI_ACTIVE",
      intent: "lead_qualification",
      aiConfidence: 0.88,
      tags: JSON.stringify(["lead"]),
    },
  });
  await prisma.message.createMany({
    data: [
      { conversationId: c5.id, role: "CUSTOMER", content: "I run a 25-person company and want AI customer support." },
      { conversationId: c5.id, role: "ASSISTANT", content: "Thanks for reaching out! I'd love to understand how we can help. What's your name?" },
    ],
  });
  await prisma.lead.create({
    data: {
      orgId: org.id,
      customerId: marcusId,
      conversationId: c5.id,
      status: "NEW",
      company: "Webb Consulting",
      companySize: 25,
      problem: "want AI customer support",
    },
  });

  // --- Tickets ---
  await prisma.ticket.create({
    data: {
      orgId: org.id,
      customerId: priyaId,
      conversationId: c3.id,
      subject: "High-value refund request — order #4701",
      description: "Customer requested a $500 refund which exceeds the approval threshold.",
      status: "OPEN",
      priority: "HIGH",
      assigneeUserId: agent.id,
    },
  });

  // --- Workflow runs (mix of states) ---
  await prisma.workflowRun.createMany({
    data: [
      {
        orgId: org.id,
        type: "LEAD_QUALIFICATION",
        status: "COMPLETED",
        payload: JSON.stringify({ conversationId: c5.id, note: "demo" }),
        result: JSON.stringify({ demo: true }),
        attempts: 1,
        maxAttempts: 3,
        completedAt: new Date(Date.now() - 3600 * 1000),
      },
      {
        orgId: org.id,
        type: "SUPPORT_ESCALATION",
        status: "COMPLETED",
        payload: JSON.stringify({ conversationId: c3.id, note: "demo" }),
        result: JSON.stringify({ demo: true }),
        attempts: 1,
        maxAttempts: 3,
        completedAt: new Date(Date.now() - 1800 * 1000),
      },
      {
        orgId: org.id,
        type: "CRM_SYNC",
        status: "FAILED",
        payload: JSON.stringify({ note: "demo simulated failure" }),
        error: "Simulated HubSpot 500 — retry exhausted",
        attempts: 3,
        maxAttempts: 3,
        completedAt: new Date(Date.now() - 7200 * 1000),
      },
      {
        orgId: org.id,
        type: "FOLLOW_UP",
        status: "RETRYING",
        payload: JSON.stringify({ note: "demo retry" }),
        error: "n8n webhook temporarily unavailable",
        attempts: 2,
        maxAttempts: 3,
        nextRunAt: new Date(Date.now() + 30 * 1000),
      },
    ],
  });

  // --- Audit logs ---
  const events = [
    { event: "ai.request", integration: "CORE", status: "SUCCESS", ms: 310 },
    { event: "tool.get_order_status", integration: "CORE", status: "SUCCESS", ms: 42 },
    { event: "tool.search_knowledge_base", integration: "RAG", status: "SUCCESS", ms: 88 },
    { event: "crm.contact.sync", integration: "HUBSPOT", status: "SUCCESS", ms: 540, demo: true },
    { event: "whatsapp.message.sent", integration: "WHATSAPP", status: "SUCCESS", ms: 120, demo: true },
    { event: "n8n.lead_qualification", integration: "N8N", status: "SUCCESS", ms: 210, demo: true },
    { event: "crm.deal.sync", integration: "HUBSPOT", status: "FAILED", ms: 1500, demo: true },
    { event: "workflow.crm_sync", integration: "N8N", status: "RETRYING", ms: 0, demo: true },
  ] as const;

  for (const e of events) {
    await prisma.auditLog.create({
      data: {
        orgId: org.id,
        event: e.event,
        integration: e.integration,
        status: e.status,
        durationMs: e.ms,
        metadata: JSON.stringify({ demo: (e as { demo?: boolean }).demo ?? false }),
      },
    });
  }

  console.log("Seed complete.");
  console.log("  Admin login: admin@agentdesk.ai / admin123");
  console.log("  Agent login: agent@agentdesk.ai / agent123");
  console.log(`  Org id: ${org.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
