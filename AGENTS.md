<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AgentDesk AI — Engineering Agent Instructions

> Scope: the entire `agentdesk-ai` repository. Keep this file concise, current, and enforceable. Do not treat the README as proof that a feature works.

## 0. Next.js 16 compatibility

Next.js 16 introduces breaking changes; do not rely only on model training knowledge for APIs, conventions, or file structure. Before changing Next.js code, consult the relevant documentation shipped in `node_modules/next/dist/docs/` and heed deprecations. Preserve the generated `nextjs-agent-rules` block above.

## 1. Product mission

AgentDesk AI is an AI customer support and sales-operations application. It demonstrates a realistic end-to-end workflow: a customer sends a WhatsApp/web message; an agent retrieves relevant knowledge or uses validated business tools; leads, orders, tickets and integrations are handled with observability and human oversight.

**Success means:** a reviewer can launch a safe demo, understand the complete customer-to-agent-to-human workflow, reproduce meaningful results, and see which integrations are live versus simulated.

Do not optimize for feature count, vanity metrics, or visual mockups that hide broken workflows. Do not label the application 'production-ready', 'multi-tenant', or 'connected to WhatsApp/HubSpot' unless those specific properties are demonstrated and verified in the relevant environment.

## 2. Repository facts and discovery

Baseline (reconfirm in source before editing):
- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4.
- Next.js route handlers/server components as the backend.
- Prisma with SQLite for the local demo and PostgreSQL/pgvector described for production.
- Signed `httpOnly`-cookie sessions, roles, deterministic demo providers, optional OpenAI and HubSpot providers.
- Web chat, WhatsApp Cloud API integration, RAG, tool registry with Zod validation, n8n workflows, background jobs, evaluation suite.
- Vitest, React Testing Library, and Playwright.

Inspect `package.json`, `src/`, `prisma/`, `e2e/`, `docs/`, `.env.example`, existing scripts, test configuration, and current working-tree changes before proposing changes. Use `src/lib/ai/agent.ts`, `src/lib/ai/tools/index.ts`, `src/lib/rag/`, and `src/lib/messaging/whatsapp.ts` as investigation starting points, **not** as assumed immutable contracts.

Suggested baseline commands, provided the scripts exist:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
# e2e only after starting the app according to the repository config
npm run e2e
```

Local-start flow: `cp .env.example .env`, `npx prisma db push`, `npm run db:seed`, `npm run dev`. Do not modify or reset a real database to make a demo run.

## 3. Modes and claims: no accidental real-world actions

Clearly separate:
1. **Deterministic demo mode:** fake/seeding-only data, no paid LLM calls, no external messaging, CRM changes, or real refunds.
2. **Connected development/staging mode:** explicitly configured external providers and sandbox/test resources.
3. **Production mode:** explicit, validated configuration; real authorization; appropriate monitoring, limits and safe deployment.

Never silently fall back from a failed live integration to a success-looking mock. UI labels and logs must indicate demo/simulated actions. Default/supplied demo accounts and passwords MUST NOT work as published production credentials. Do not leak tokens or sensitive integration data to browser bundles, logs, telemetry, screenshots or the README.

Treat public demo endpoints as potentially abusive: establish rate limits, usage quotas, payload caps and protection against spam/resource exhaustion before exposing them on the internet. Make any real side-effect operation opt-in and auditable.

## 4. Agent and tool safety

- Keep the tool registry and argument schemas as the source of truth. Validate every tool call with Zod **and** server-side permission/business rules; schema validity alone is insufficient.
- LLM responses, web messages, knowledge documents, retrieved passages and external tool results are untrusted input. Never let their content override system/developer instructions or tool permissions.
- A customer message must not create refunds, send messages, change CRM records, book real appointments or trigger similar irreversible actions without all required checks; sensitive actions should use an auditable approval/confirmation path.
- Apply authorization and workspace boundaries when reading orders, customers, leads, conversations, tickets, logs or retrieved knowledge. Do not implement or claim multi-tenancy until every relevant query is scoped and tested.
- Prevent repeated side effects using idempotency keys, retries with clear terminal states, and concurrency-safe processing. Verify job/webhook failure paths, not just happy paths.
- Ground factual answers about policies/orders in retrieved or authoritative data. Do not invent order status, policy text, citations, CRM IDs or refund results. When grounding is absent or confidence too low, communicate uncertainty or escalate.
- Record sufficiently useful tool/agent events for debugging, but mask PII and secrets; do not dump full private prompts, credentials or customer conversations into unrestricted logs.

## 5. Integrations

- OpenAI: real calls only when configured and permitted; deterministic provider remains available for local/CI evaluation.
- RAG: verify document ingestion, chunking, source identity, retrieval ranking, empty search, low confidence, citation correctness, document boundaries and deletion/update behavior. Demo hash embeddings are not evidence of production retrieval quality.
- HubSpot: distinguish sandbox/provider-mock actions from verified API writes; handle auth failure, throttling, and duplicate creation.
- WhatsApp: validate verification token, HMAC request signature, inbound message ID idempotency, outbound failure, replay and provider error behavior before enabling.
- n8n: document the exact input/output shape, auth/signature strategy, failure handling, retries and idempotency for each workflow. Importability alone does not prove end-to-end execution.
- Database: inspect current Prisma provider/schema/migrations before adopting PostgreSQL or pgvector; do not assume SQLite schemas deploy unchanged. Plan safe migrations and rollback.

## 6. UI, demo journey and accessibility

Prioritize a working 'hero journey' for a prospective client:
1. Open the demo and understand the product within seconds.
2. Send a customer support question via web chat.
3. Show the agent's source-backed answer, tool events and/or escalation.
4. Show the corresponding conversation and audit history in the dashboard.
5. Demonstrate one clearly labelled sales-lead workflow (and mock vs live CRM status).
6. Show reliable summary metrics that are derived from actual demo data and execution.

Every primary feature must have real loading, empty, success, failure and disabled states. Use consistent layout/typography and semantic accessible controls; keyboard navigation, visible focus, color contrast and responsive mobile layouts matter. Avoid exposing administrative actions to unauthenticated visitors. Favor accessible, stable demo seed data over fake counters and decorative metrics.

## 7. Tests and evidence

Before edits: run/document baseline checks and existing failures. After edits: add targeted regression coverage and rerun checks. Do not delete, skip, relax or mock away a failing test to claim success.

High-priority regression cases:
- auth/session expiry, roles and unauthorized data access;
- public chat validation, rate limits, malformed inputs and abuse;
- prompt-injection attempts and cross-customer data access;
- grounding/citation quality and low-confidence escalation;
- sensitive tool calls: approval, denial, double-submit and idempotency;
- CRM/WhatsApp/n8n failure handling, retries and replay;
- job deduplication/concurrent execution;
- lead-to-conversation-to-dashboard consistency;
- desktop and mobile end-to-end hero flow.

Do not claim evaluation scenarios 'passed' just because the number appears in the README. Publish metrics only after a real run with reproducible dataset, version, timestamp and denominator. Test mode must not spend real API credits unintentionally.

## 8. Portfolio-grade visual evidence

Capture **real** application screenshots using Playwright/browser automation against a running build with seeded **non-sensitive** demo data. Suggested visuals: main dashboard, chat with grounded answer, conversation details/tool trace, lead pipeline, human escalation, evaluation dashboard; desktop and mobile for representative flows.

- Never fabricate UI screenshots, alter results, crop out failures to imply a pass, or use production customer data.
- Use neutral demo entities and keep screens readable at typical GitHub README sizes.
- Store approved screenshots in `docs/screenshots/` and reference them from the README.
- If the app cannot run, explicitly report screenshots as blocked; do not substitute mock designs and call them captures.

## 9. Scope and implementation workflow

For every non-trivial request:
1. Summarize verified current behavior and remaining unknowns.
2. Write a short plan ordered by risk/dependencies; list affected files.
3. Implement one coherent slice using existing architecture.
4. Run relevant tests/build and manually inspect critical UX flows.
5. Update setup/docs, screenshots and evaluation claims only when evidence exists.
6. Report changes, results, pre-existing failures, gaps and follow-up steps.

Keep changes narrow. Preserve the user's uncommitted work. Ask before destructive database/schema actions, overwrites, deploys affecting live users, token rotation or real external side effects.

## 10. Release / portfolio definition of done

A milestone is complete only when: the demo starts from documented steps; the central chat/support/sales workflow genuinely works; mock/live status is unambiguous; no critical auth/data-leak/side-effect issue remains known; CI/test/build results are recorded; screenshots are real; the README includes exact setup, a safe public demo if available, limitations and architecture; and the Upwork case study makes only verified claims.

In the final response always include: what changed, why, exact checks run with pass/fail/not-run status, screenshot/deployment evidence, and remaining risks. Do not claim repository changes have been pushed until the remote commit/PR is confirmed.
