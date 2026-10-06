import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { ingestDocument } from "../ingest";
import { demoEmbed } from "../embedder";
import { DemoVectorStore } from "./demo";
import { isPgvectorEnabled } from "./index";

describe("vector store selection", () => {
  it("defaults to the demo store (pgvector is opt-in)", () => {
    delete process.env.USE_PGVECTOR;
    expect(isPgvectorEnabled()).toBe(false);
  });

  it("enables pgvector only when USE_PGVECTOR=true", () => {
    process.env.USE_PGVECTOR = "true";
    expect(isPgvectorEnabled()).toBe(true);
    delete process.env.USE_PGVECTOR;
  });
});

describe("DemoVectorStore retrieval", () => {
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "RAG Test Org", slug: `rag-test-${Date.now()}`, settings: "{}" },
    });
    orgId = org.id;
    await ingestDocument({
      orgId,
      title: "Refund Policy",
      source: "test",
      type: "MANUAL",
      text: "Refunds are available within 30 days of purchase. To request a refund, provide your order number. Refund amounts above $100 require manual approval.",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns semantically relevant chunks above the threshold", async () => {
    const store = new DemoVectorStore();
    const chunks = await store.retrieve(orgId, demoEmbed("what is your refund policy"), {
      limit: 4,
      threshold: 0.2,
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content.toLowerCase()).toContain("refund");
    expect(chunks[0].documentTitle).toBe("Refund Policy");
    expect(chunks[0].score).toBeGreaterThanOrEqual(0.2);
  });

  it("returns nothing when the threshold is unreachable", async () => {
    const store = new DemoVectorStore();
    const chunks = await store.retrieve(orgId, demoEmbed("refund policy"), {
      limit: 4,
      threshold: 0.99,
    });
    expect(chunks).toHaveLength(0);
  });
});

describe("ingestion deduplication", () => {
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "Dedup Org", slug: `dedup-${Date.now()}`, settings: "{}" },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("does not create a second document for identical content", async () => {
    const text = "Shipping is free on orders over $50 within the continental US.";
    const first = await ingestDocument({ orgId, title: "Shipping A", source: "t", type: "MANUAL", text });
    const second = await ingestDocument({ orgId, title: "Shipping B", source: "t", type: "MANUAL", text });
    expect(second).toBe(first);

    const count = await prisma.knowledgeDocument.count({ where: { orgId } });
    expect(count).toBe(1);
    const chunks = await prisma.knowledgeChunk.count({ where: { documentId: first } });
    expect(chunks).toBeGreaterThan(0);
  });

  it("stores a content hash for every document", async () => {
    const doc = await prisma.knowledgeDocument.findFirst({ where: { orgId } });
    expect(doc?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
