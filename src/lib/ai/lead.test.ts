import { describe, it, expect } from "vitest";
import { scoreLead, leadScoreBreakdown } from "./tools";
import { extractLeadFields, missingFields } from "./lead";

describe("scoreLead", () => {
  it("scores a fully-qualified lead highly", () => {
    const score = scoreLead({
      email: "alice@example.com",
      company: "Acme",
      companySize: 50,
      problem: "We spend too much time answering support tickets manually.",
      solution: "We need an AI agent to automate customer support.",
      budgetRange: "$2000/mo",
      timeline: "next month",
    });
    expect(score).toBeGreaterThanOrEqual(6);
  });

  it("scores an empty lead at zero", () => {
    expect(scoreLead({})).toBe(0);
  });

  it("produces a transparent breakdown", () => {
    const b = leadScoreBreakdown({ email: "a@b.com", company: "X" });
    expect(b.hasEmail).toBe(1);
    expect(b.hasCompany).toBe(1);
  });
});

describe("extractLeadFields", () => {
  it("extracts email and company size", () => {
    const fields = extractLeadFields(
      "Contact me at alice@example.com, we have 25 employees",
    );
    expect(fields.email).toBe("alice@example.com");
    expect(fields.companySize).toBe(25);
  });

  it("extracts hyphenated company sizes", () => {
    const fields = extractLeadFields(
      "I run a 25-person company and want AI customer support.",
    );
    expect(fields.companySize).toBe(25);
    expect(fields.problem).toContain("customer support");
  });
});

describe("missingFields", () => {
  it("reports missing required fields", () => {
    const missing = missingFields({
      id: "1",
      name: "Alice",
      email: null,
      company: null,
      companySize: null,
      problem: null,
      solution: null,
      budgetRange: null,
      timeline: null,
      notes: null,
      score: null,
      status: "NEW",
      qualifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      orgId: "o",
      customerId: "c",
      conversationId: "conv",
    } as never);
    expect(missing).toContain("email");
    expect(missing).not.toContain("name");
  });
});
