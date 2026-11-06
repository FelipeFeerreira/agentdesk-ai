import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { seedDemo } from "@/lib/seed/demo";

/**
 * Scheduled reseed of the public demo.
 *
 * The public demo is open by design (anyone can sign in with the seeded admin
 * account and click through the product), so the dataset drifts during the day.
 * A cron calls this endpoint every few hours and the demo starts clean again.
 *
 * Enabled only when DEMO_MODE is not "false" AND DEMO_RESEED_SECRET is set.
 * Otherwise the route answers 404, so a normal deployment does not expose it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.DEMO_RESEED_SECRET;
  if (process.env.DEMO_MODE === "false" || !secret) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const prisma = new PrismaClient();
  try {
    await seedDemo(prisma);
    return NextResponse.json({ ok: true, reseededAt: new Date().toISOString() });
  } catch (error) {
    console.error("demo reseed failed", error);
    return NextResponse.json({ error: "reseed failed" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
