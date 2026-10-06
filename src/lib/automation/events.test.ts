import { describe, it, expect } from "vitest";
import {
  buildAutomationEvent,
  jobTypeToEventType,
  automationEventSchema,
} from "./events";

describe("buildAutomationEvent", () => {
  it("builds a valid versioned envelope", () => {
    const e = buildAutomationEvent("LEAD_QUALIFIED", "org_1", {
      leadId: "l1",
      conversationId: "c1",
      email: "a@b.com",
      score: 7,
    });
    expect(e.type).toBe("LEAD_QUALIFIED");
    expect(e.version).toBe(1);
    expect(e.organizationId).toBe("org_1");
    expect(e.eventId).toMatch(/^evt_/);
    expect(new Date(e.timestamp).toString()).not.toBe("Invalid Date");
    expect(automationEventSchema.safeParse(e).success).toBe(true);
  });

  it("rejects a payload missing required fields", () => {
    expect(() =>
      buildAutomationEvent("LEAD_QUALIFIED", "org_1", { leadId: "l1" }),
    ).toThrow();
  });

  it("rejects an invalid email", () => {
    expect(() =>
      buildAutomationEvent("LEAD_QUALIFIED", "org_1", {
        leadId: "l1",
        conversationId: "c1",
        email: "not-an-email",
        score: 1,
      }),
    ).toThrow();
  });

  it("applies defaults for optional fields (support escalation priority)", () => {
    const e = buildAutomationEvent("SUPPORT_ESCALATED", "org_1", {
      conversationId: "c1",
      reason: "Refund over threshold",
      summary: "Needs approval",
    });
    expect(automationEventSchema.safeParse(e).success).toBe(true);
  });
});

describe("jobTypeToEventType", () => {
  it("maps internal job types to automation event types", () => {
    expect(jobTypeToEventType("LEAD_QUALIFICATION")).toBe("LEAD_QUALIFIED");
    expect(jobTypeToEventType("SUPPORT_ESCALATION")).toBe("SUPPORT_ESCALATED");
    expect(jobTypeToEventType("FOLLOW_UP")).toBe("LEAD_FOLLOW_UP");
    expect(jobTypeToEventType("KB_INGESTION")).toBe("KNOWLEDGE_UPDATE");
  });

  it("returns null for job types without an automation contract", () => {
    expect(jobTypeToEventType("GENERIC")).toBeNull();
    expect(jobTypeToEventType("CRM_SYNC")).toBeNull();
  });
});
