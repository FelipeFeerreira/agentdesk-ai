import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import {
  organizationSettingsSchema,
  parseSettings,
  serializeSettings,
} from "@/lib/settings";
import { audit } from "@/lib/observability/audit";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const parsed = organizationSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings.", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUnique({ where: { id: user.orgId } });
  const current = parseSettings(org?.settings ?? "{}");
  const merged = {
    ai: { ...current.ai, ...parsed.data.ai },
    business: { ...current.business, ...parsed.data.business },
    knowledge: { ...current.knowledge, ...parsed.data.knowledge },
    automation: { ...current.automation, ...parsed.data.automation },
  };

  await prisma.organization.update({
    where: { id: user.orgId },
    data: { settings: serializeSettings(merged) },
  });

  await audit(user.orgId, { event: "settings.updated", integration: "CORE", status: "SUCCESS" });

  return NextResponse.json({ ok: true, settings: merged });
}
