import { prisma } from "@/lib/db";
import type { IntegrationType } from "@prisma/client";

const ORDER: IntegrationType[] = ["OPENAI", "HUBSPOT", "WHATSAPP", "N8N", "GOOGLE_DRIVE"];

export async function getIntegrationModes() {
  const rows = await prisma.integration.findMany();
  const map = new Map(rows.map((r) => [r.type, r]));
  return ORDER.map((type) => ({
    type,
    mode: map.get(type)?.mode ?? "DEMO",
    isConfigured: map.get(type)?.isConfigured ?? false,
  }));
}
