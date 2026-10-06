import { test, expect } from "@playwright/test";

test.describe("AgentDesk AI end-to-end", () => {
  test("login → dashboard → web chat agent response", async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@agentdesk.ai");
    await page.getByLabel("Password").fill("admin123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/overview");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    // Open the web chat and ask the agent a seeded question
    await page.goto("/chat");
    await page.getByPlaceholder("Message the AI agent…").fill("Where is order #4582?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Order 4582", { exact: false })).toBeVisible({
      timeout: 15000,
    });
  });
});
