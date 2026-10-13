#!/usr/bin/env node
/**
 * Capture REAL AgentDesk AI screenshots from a running instance.
 *
 * Prerequisites:
 *   npm ci
 *   npx playwright install chromium
 *   npx prisma db push && npm run db:seed
 *   npm run build && npx next start -p 3100   # or: npm run dev
 *
 * Usage:
 *   SCREENSHOT_BASE_URL=http://localhost:3100 node scripts/capture-portfolio-screenshots.mjs
 *
 * The script logs in with the documented DEMO credentials (or the values from
 * SCREENSHOT_EMAIL / SCREENSHOT_PASSWORD) and never stores them to disk.
 * Screenshots are saved to docs/screenshots/ (override with SCREENSHOT_DIR).
 * No image is fabricated: every file is a real capture of the running app.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const base = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";
const outputDir = resolve(process.env.SCREENSHOT_DIR || "docs/screenshots");
const email = process.env.SCREENSHOT_EMAIL || "admin@agentdesk.ai";
const password = process.env.SCREENSHOT_PASSWORD || "admin123";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

let failures = 0;
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function shoot(page, name, note) {
  try {
    await page.waitForTimeout(900);
    const file = resolve(outputDir, `${slug(name)}.png`);
    await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
    console.log(`  ✓ ${name} -> ${file}${note ? ` (${note})` : ""}`);
  } catch (e) {
    failures += 1;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

async function login(ctx) {
  // Authenticate via the API so the session cookie lands in the context jar
  // (a deterministic, standard Playwright pattern). Demo credentials only.
  const res = await ctx.request.post(new URL("/api/auth/login", base).toString(), {
    data: { email, password },
  });
  if (!res.ok()) throw new Error(`login failed: HTTP ${res.status()}`);
}

const browser = await chromium.launch({ headless: true });
try {
  await mkdir(outputDir, { recursive: true });

  // --- Public pages --------------------------------------------------------
  const publicCtx = await browser.newContext({ viewport: DESKTOP, colorScheme: "light", reducedMotion: "reduce" });
  const publicPage = await publicCtx.newPage();
  await publicPage.goto(new URL("/", base).toString(), { waitUntil: "networkidle" });
  await shoot(publicPage, "landing-desktop");

  await publicPage.goto(new URL("/chat", base).toString(), { waitUntil: "networkidle" });
  await shoot(publicPage, "chat-empty-desktop");

  // Send a real message and capture the grounded answer.
  await publicPage.getByPlaceholder("Message the AI agent…").fill("Where is order #4582?");
  await publicPage.getByRole("button", { name: "Send" }).click();
  await publicPage.getByText(/Order 4582/i).waitFor({ timeout: 20_000 });
  await shoot(publicPage, "chat-grounded-answer-desktop");

  // Escalation scenario in a fresh visitor session.
  const escPage = await publicCtx.newPage();
  await escPage.goto(new URL("/chat", base).toString(), { waitUntil: "networkidle" });
  await escPage.getByPlaceholder("Message the AI agent…").fill("I need a $500 refund for order #4701.");
  await escPage.getByRole("button", { name: "Send" }).click();
  await escPage.getByText(/above what I can approve/i).waitFor({ timeout: 20_000 });
  await shoot(escPage, "chat-escalation-desktop");
  await publicCtx.close();

  // --- Authenticated dashboard ---------------------------------------------
  const appCtx = await browser.newContext({ viewport: DESKTOP, colorScheme: "light", reducedMotion: "reduce" });
  const app = await appCtx.newPage();
  await login(appCtx);

  const routes = [
    ["Dashboard overview", "/overview"],
    ["Conversations", "/conversations"],
    ["Leads", "/leads"],
    ["Tickets", "/tickets"],
    ["Knowledge base", "/knowledge"],
    ["Automations", "/automations"],
    ["Evaluations", "/evaluations"],
    ["Logs", "/logs"],
    ["Settings", "/settings"],
  ];
  for (const [name, path] of routes) {
    await app.goto(new URL(path, base).toString(), { waitUntil: "networkidle" });
    if (process.env.SCREENSHOT_DEBUG) console.log(`    [debug] ${path} -> ${app.url()}`);
    await shoot(app, `${slug(name)}-desktop`);

    // Right after the list is rendered, open the first conversation detail
    // (tool trace + sources) while the page is guaranteed to be loaded.
    if (path === "/conversations") {
      const links = app.locator('a[href^="/conversations/"]');
      if ((await links.count()) > 0) {
        const href = await links.first().getAttribute("href");
        if (href) {
          await app.goto(new URL(href, base).toString(), { waitUntil: "networkidle" });
          await shoot(app, "conversation-detail-desktop");
          await app.goto(new URL(path, base).toString(), { waitUntil: "networkidle" });
        }
      }
    }
  }
  await appCtx.close();

  // --- Mobile --------------------------------------------------------------
  const mobileCtx = await browser.newContext({ viewport: MOBILE, colorScheme: "light", reducedMotion: "reduce", isMobile: true, hasTouch: true });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(new URL("/chat", base).toString(), { waitUntil: "networkidle" });
  await mobile.getByPlaceholder("Message the AI agent…").fill("What is your refund policy?");
  await mobile.getByRole("button", { name: "Send" }).click();
  await mobile.getByText(/Refund Policy/i).waitFor({ timeout: 20_000 });
  await shoot(mobile, "chat-mobile");

  await login(mobileCtx);
  await mobile.goto(new URL("/overview", base).toString(), { waitUntil: "networkidle" });
  await shoot(mobile, "dashboard-overview-mobile");
  await mobile.goto(new URL("/conversations", base).toString(), { waitUntil: "networkidle" });
  await shoot(mobile, "conversations-mobile");
  await mobileCtx.close();
} finally {
  await browser.close();
}

if (failures) {
  console.error(`\n${failures} capture(s) failed. Check routes/auth/availability.`);
  process.exitCode = 1;
} else {
  console.log("\nAll screenshots captured.");
}
