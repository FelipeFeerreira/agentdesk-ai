import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * Write limit for the public demo.
 *
 * The demo is meant to be clicked through, not used: one visitor pushing a few
 * hundred writes would leave a mess for the next recruiter. This middleware
 * caps mutating requests per IP and per minute when DEMO_MODE is on. Reads are
 * never limited, so browsing the dashboard stays free.
 *
 * Limitation, stated on purpose: the counter lives in memory, so on a
 * serverless platform each instance keeps its own. It raises the cost of abuse,
 * it does not make the demo immune — the scheduled reseed is the real cleanup.
 */
const WRITE_LIMIT = 40;
const WINDOW_MS = 60_000;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(request: NextRequest) {
  if (process.env.DEMO_MODE === "false" || !WRITE_METHODS.has(request.method)) {
    return NextResponse.next();
  }
  // The reseed endpoint is protected by its own secret.
  if (request.nextUrl.pathname.startsWith("/api/demo/reseed")) {
    return NextResponse.next();
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
  const result = rateLimit(`write:${ip}`, WRITE_LIMIT, WINDOW_MS);

  if (!result.ok) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      {
        error:
          "This public demo limits how many changes one visitor can make. Wait a moment, or browse the seeded data — the demo resets on a schedule.",
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
