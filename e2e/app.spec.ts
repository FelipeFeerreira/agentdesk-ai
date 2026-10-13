import { test, expect, type Page } from "@playwright/test";

const DEMO = { email: "admin@agentdesk.ai", password: "admin123" };

async function login(page: Page) {
  // page.request shares the cookie jar with the page's context.
  const res = await page.request.post("/api/auth/login", { data: DEMO });
  expect(res.ok(), "demo login should succeed").toBeTruthy();
}

test("login endpoint rejects invalid credentials", async ({ page }) => {
  const res = await page.request.post("/api/auth/login", {
    data: { email: DEMO.email, password: "wrong-password" },
  });
  expect(res.status()).toBe(401);
});

test("hero flow: dashboard → web chat grounded answer → conversation, staying authenticated", async ({
  page,
}) => {
  await login(page);

  // Dashboard
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // Regression: navigating across dashboard pages must NOT sign the user out
  // (a prefetched GET /logout used to clear the session).
  await page.goto("/conversations");
  await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);

  // Conversation detail renders a tool trace.
  const firstConv = page.locator('a[href^="/conversations/"]').first();
  await expect(firstConv).toBeVisible();
  await firstConv.click();
  await expect(page.getByText("Tool calls")).toBeVisible({ timeout: 15_000 });

  // Public web chat returns a grounded, data-backed answer.
  await page.goto("/chat");
  await page.getByPlaceholder("Message the AI agent…").fill("Where is order #4582?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Order 4582/i)).toBeVisible({ timeout: 20_000 });
});

test("sensitive refund above threshold escalates to a human", async ({ page }) => {
  await page.goto("/chat");
  await page.getByPlaceholder("Message the AI agent…").fill("I need a $500 refund for order #4701.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/above what I can approve/i)).toBeVisible({ timeout: 20_000 });
});

test("repeated identical messages are both answered (no duplicate error)", async ({ page }) => {
  await page.goto("/chat");
  const box = page.getByPlaceholder("Message the AI agent…");

  await box.fill("Where is order #4582?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Order 4582/i).first()).toBeVisible({ timeout: 20_000 });

  // Sending the exact same text again must work (not a duplicate rejection).
  await box.fill("Where is order #4582?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Order 4582/i)).toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
});
