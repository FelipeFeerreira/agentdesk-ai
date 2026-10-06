import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("openai", () => ({
  default: vi.fn(() => ({ chat: { completions: { create: mockCreate } } })),
}));

import { OpenAIProvider } from "./openai";

function agentInput(overrides: Partial<Parameters<OpenAIProvider["planStep"]>[0]> = {}) {
  return {
    intent: { intent: "order_status" as const, confidence: 0.9 },
    customerMessage: "Where is order #4582?",
    history: [],
    toolResults: [],
    sources: [],
    ...overrides,
  };
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-4o-mini";
  mockCreate.mockReset();
});

describe("OpenAIProvider.classifyIntent", () => {
  it("maps a valid structured intent response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ intent: "order_status", confidence: 0.9, orderNumber: "4582" }) } }],
    });
    const r = await new OpenAIProvider().classifyIntent("Where is order #4582?", []);
    expect(r.intent).toBe("order_status");
    expect(r.entities?.orderNumber).toBe("4582");
    expect(r.confidence).toBe(0.9);
  });

  it("falls back to general_support on malformed JSON", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "not json" } }] });
    const r = await new OpenAIProvider().classifyIntent("hello", []);
    expect(r.intent).toBe("general_support");
  });

  it("rejects intents outside the known set", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ intent: "evil_intent", confidence: 0.9 }) } }] });
    const r = await new OpenAIProvider().classifyIntent("hello", []);
    expect(r.intent).toBe("general_support");
  });
});

describe("OpenAIProvider.planStep", () => {
  it("maps a function tool_call to a StepDecision", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { tool_calls: [{ function: { name: "get_order_status", arguments: JSON.stringify({ orderNumber: "4582" }) } }] } }],
    });
    const d = await new OpenAIProvider().planStep(agentInput());
    expect(d.type).toBe("tool_call");
    if (d.type === "tool_call") {
      expect(d.tool).toBe("get_order_status");
      expect(d.args).toEqual({ orderNumber: "4582" });
    }
  });

  it("tolerates malformed tool arguments", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { tool_calls: [{ function: { name: "get_order_status", arguments: "{" } }] } }],
    });
    const d = await new OpenAIProvider().planStep(agentInput());
    expect(d.type).toBe("tool_call");
    if (d.type === "tool_call") expect(d.args).toEqual({});
  });

  it("returns respond when the model sends no tool calls", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "Here is your answer." } }] });
    const d = await new OpenAIProvider().planStep(agentInput());
    expect(d.type).toBe("respond");
    if (d.type === "respond") expect(d.content).toBe("Here is your answer.");
  });

  it("sends tool schemas without a $schema keyword", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "ok" } }] });
    await new OpenAIProvider().planStep(agentInput());
    const call = mockCreate.mock.calls[0][0] as { tools: { function: { parameters: Record<string, unknown> } }[] };
    for (const t of call.tools) {
      expect(t.function.parameters.$schema).toBeUndefined();
      expect(t.function.parameters.type).toBe("object");
    }
  });
});

describe("OpenAIProvider.generateResponse", () => {
  it("returns the model content", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "Your order is shipped." } }] });
    const r = await new OpenAIProvider().generateResponse(agentInput());
    expect(r).toBe("Your order is shipped.");
  });
});
