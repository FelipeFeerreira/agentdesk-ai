import { describe, it, expect } from "vitest";
import { parseSettings, defaultSettings, organizationSettingsSchema } from "./settings";

describe("parseSettings", () => {
  it("returns defaults for empty input", () => {
    const s = parseSettings("{}");
    expect(s.ai.model).toBe(defaultSettings.ai.model);
    expect(s.business.refundApprovalThresholdUsd).toBe(100);
  });

  it("returns defaults for malformed JSON", () => {
    const s = parseSettings("not json");
    expect(s.knowledge.retrievalLimit).toBe(defaultSettings.knowledge.retrievalLimit);
  });

  it("overrides individual fields while keeping the rest", () => {
    const s = parseSettings(
      JSON.stringify({ business: { refundApprovalThresholdUsd: 250 } }),
    );
    expect(s.business.refundApprovalThresholdUsd).toBe(250);
    expect(s.business.supportHours).toBe(defaultSettings.business.supportHours);
  });

  it("rejects invalid values", () => {
    expect(() =>
      organizationSettingsSchema.parse({ knowledge: { retrievalLimit: -1 } }),
    ).toThrow();
  });
});
