import { describe, it, expect, vi, afterEach } from "vitest";
import { dispatchAutomationEvent } from "@/lib/automation/n8n";
import { sendWhatsAppMessage } from "@/lib/messaging/whatsapp";
import { buildAutomationEvent } from "@/lib/automation/events";
import { prisma } from "@/lib/db";
import { defaultSettings, serializeSettings } from "@/lib/settings";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_WEBHOOK_SECRET;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
});

describe("demo mode never performs external calls", () => {
  it("n8n dispatch records locally and does not fetch, even with a webhook configured", async () => {
    process.env.DEMO_MODE = "true";
    process.env.N8N_WEBHOOK_URL = "https://example.invalid/hook";

    const org = await prisma.organization.create({
      data: { name: "Demo Net Org", slug: `demonet-${Date.now()}`, settings: serializeSettings(defaultSettings) },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const event = buildAutomationEvent("SUPPORT_ESCALATED", org.id, {
      conversationId: "c1",
      reason: "test",
      summary: "test",
    });
    const result = await dispatchAutomationEvent(event);

    expect(result.demo).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    await prisma.$disconnect();
  });

  it("whatsapp send returns a demo result without fetching, even with credentials present", async () => {
    process.env.DEMO_MODE = "true";
    process.env.WHATSAPP_TOKEN = "fake-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await sendWhatsAppMessage("15550000", "hello");

    expect(result.demo).toBe(true);
    expect(result.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
