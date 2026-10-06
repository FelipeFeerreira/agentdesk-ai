import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { processDueJobs } from "@/lib/automation/jobs";

export async function POST() {
  await requireUser();
  const processed = await processDueJobs();
  return NextResponse.json({ ok: true, processed });
}
