# Upwork portfolio — AgentDesk AI case study

> Every claim below was verified against the running application and the recorded
> test results. Features that need external credentials are labelled as such and
> were **not** exercised by the default demo.

## Title

**AI Customer Support & Sales Automation Platform**

## Role

Full-Stack Developer · AI Agent & Workflow Automation

## Problem

Businesses receive customer questions and sales inquiries across channels, but
support and sales teams repeatedly do the same manual work: look up orders,
answer the same policy questions, qualify the same leads, and copy data into the
CRM. A thin "chatbot wrapper" produces plausible text but cannot be trusted for
real answers or auditable actions.

## Solution

AgentDesk AI is a full-stack customer-operations platform where a tool-calling AI
agent works with real data and tools:

- Answers support questions from a knowledge base (RAG with citations)
- Looks up real customer and order records
- Qualifies leads with transparent scoring and drives a CRM workflow
- Escalates sensitive or low-confidence cases to a human
- Emits versioned automation events that an n8n workflow owns (CRM side effects)

## Architecture

A single Next.js 16 (App Router) application with a layered, domain-oriented
structure and vendor-neutral abstractions (`LLMProvider`, `CRMProvider`,
`VectorStore`).

```
Customer → WhatsApp / Web Chat → Application API → AI Agent Router
  → Tool calling (Zod-validated) → RAG / Orders / CRM / Tickets
  → Structured result → AI response
```

## What was built and verified

| Area | Status | Evidence |
| --- | --- | --- |
| Tool-calling agent (intent → validated tool → structured result) | ✅ working | unit + integration tests, web chat |
| Order / customer lookup against the database | ✅ working | `tools.test.ts`, demo |
| Human escalation (refund above threshold, explicit requests) | ✅ working | E2E test, demo |
| RAG knowledge base (ingest → chunk → embed → cite) | ✅ working (demo embeddings) | `store.test.ts` |
| Background jobs (retry, backoff, idempotency, dead-letter) | ✅ working | `jobs.ts`, demo |
| Versioned n8n event contract (single signed endpoint) | ✅ implemented | `events.test.ts` |
| HubSpot provider (search-first upsert, 429/5xx retry) | ⚠️ implemented, mock-tested | `hubspot.test.ts` (no live token) |
| WhatsApp Cloud API webhook (signature, idempotency) | ⚠️ implemented, not live-tested | code + docs |
| PostgreSQL + pgvector retrieval | ⚠️ implemented, not run on Postgres | code + SQL + docs |
| Google Drive ingestion | ❌ not implemented | roadmap |

## Measured results (real, not fabricated)

- **Unit / integration tests:** 84 passing across 12 files.
- **End-to-end (Playwright):** 3 passing — login, hero flow (dashboard → grounded
  chat answer → conversation detail, staying authenticated), and refund escalation.
- **AI evaluation suite (deterministic demo provider):** 110 scenarios —
  100% intent accuracy, 100% tool selection, 100% escalation correctness,
  63.6% RAG retrieval (some questions are outside the 6 seeded documents).
- **Screenshots:** 17 real captures in `docs/screenshots/` (desktop + mobile).

> Live-model and live-integration metrics are intentionally **not** listed: they
> require the owner's OpenAI/HubSpot/WhatsApp/n8n/Postgres credentials. The same
> evaluation suite runs against a live model with `DEMO_MODE=false` +
> `OPENAI_API_KEY`.

## Engineering highlights

- Tool registry with Zod schemas **and** server-side business rules; the model
  never invents order/policy data.
- Single-owner CRM writes: the agent persists state and emits one event; n8n
  owns the HubSpot upsert/deal/association (no duplicates).
- Idempotency: WhatsApp message ids, job idempotency keys, content-hash document dedup.
- Human-in-the-loop with a concise decision summary (no exposed chain-of-thought).
- Observability: every AI request, tool call, integration and workflow is audited.

## Skills / tags

Next.js · TypeScript · AI Agents · Tool Calling · RAG · Workflow Automation ·
CRM Integration · API Integration · n8n · Full-Stack Development

## Safe footnote

> Portfolio demonstration; third-party integrations require customer
> credentials/configuration. Screenshots use fictional demo data.

## Suggested GitHub About text

`AI-powered customer support and sales automation demo with RAG, tool calling, CRM workflows, human escalation, and a Next.js dashboard.`
