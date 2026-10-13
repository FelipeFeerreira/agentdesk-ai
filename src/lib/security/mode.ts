/**
 * Demo-mode gate — the single source of truth for "am I allowed to touch the
 * outside world / enforce production authorization".
 *
 * When demo mode is active (the default), the application must never perform an
 * external side effect (LLM, CRM, WhatsApp, n8n, embeddings) regardless of
 * which credentials happen to be present, and it intentionally shares the
 * seeded fictional fixtures for the walkthrough.
 */
export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE ?? "true") !== "false";
}
