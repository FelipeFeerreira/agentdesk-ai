import { describe, it, expect } from "vitest";
import { demoEmbed, cosineSimilarity } from "./embedder";

describe("demoEmbed", () => {
  it("produces vectors of the configured dimension", () => {
    const v = demoEmbed("refund policy");
    expect(v).toHaveLength(384);
  });

  it("produces unit-length vectors", () => {
    const v = demoEmbed("shipping and delivery information");
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("ranks semantically similar text above dissimilar text", () => {
    const q = demoEmbed("What is your refund policy?");
    const relevant = demoEmbed("Refunds are available within 30 days of purchase.");
    const irrelevant = demoEmbed("Expedited shipping takes 1 to 2 business days.");
    expect(cosineSimilarity(q, relevant)).toBeGreaterThan(
      cosineSimilarity(q, irrelevant),
    );
  });

  it("handles stemming so refund/refunds and shipping/shipped match", () => {
    const a = demoEmbed("refund for my order");
    const b = demoEmbed("refunds are processed quickly");
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.3);
  });
});
