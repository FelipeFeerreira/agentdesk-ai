import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

/**
 * Sign-out is a POST so it is never triggered by a prefetch or a crawler.
 * (A GET link here caused Next's link prefetch to clear the session.)
 */
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
