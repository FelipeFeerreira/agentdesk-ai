import { describe, it, expect } from "vitest";
import { DemoProvider, extractAmountCents, extractOrderNumber } from "./demo";

const provider = new DemoProvider();

describe("extractOrderNumber", () => {
  it("extracts order numbers with #", () => {
    expect(extractOrderNumber("Where is order #4582?")).toBe("4582");
  });
  it("extracts bare order numbers", () => {
    expect(extractOrderNumber("status of order 4610")).toBe("4610");
  });
  it("does not treat currency amounts as order numbers", () => {
    expect(extractOrderNumber("I need a $2000 budget")).toBeUndefined();
  });
  it("does not match numbers longer than 6 digits", () => {
    expect(extractOrderNumber("order #999999999999")).toBeUndefined();
  });
});

describe("extractAmountCents", () => {
  it("extracts dollar amounts", () => {
    expect(extractAmountCents("I need a $500 refund")).toBe(50000);
  });
  it("extracts decimal amounts", () => {
    expect(extractAmountCents("refund $49.99 please")).toBe(4999);
  });
});

describe("DemoProvider.classifyIntent", () => {
  const cases: [string, string][] = [
    ["Where is order #4582?", "order_status"],
    ["What is your refund policy?", "refund_policy"],
    ["I need a $500 refund for order #4701.", "refund_request"],
    ["How long does shipping take?", "shipping_question"],
    ["How much does it cost?", "pricing_question"],
    ["I run a 25-person company and want AI customer support.", "lead_qualification"],
    ["I want to speak to a human.", "human_request"],
    ["How do I connect my WhatsApp account?", "general_support"],
  ];

  for (const [input, expected] of cases) {
    it(`classifies "${input}" as ${expected}`, async () => {
      const result = await provider.classifyIntent(input, []);
      expect(result.intent).toBe(expected);
    });
  }

  it("does not confuse '25-person' with a human request", async () => {
    const r = await provider.classifyIntent(
      "I run a 25-person company and want AI customer support.",
      [],
    );
    expect(r.intent).toBe("lead_qualification");
  });
});
