# Case study — AgentDesk AI

> Ready to adapt into an Upwork portfolio page or client proposal.

## Problem

Businesses receive customer questions and sales inquiries across multiple
channels (WhatsApp, web chat), yet support and sales teams repeatedly perform
the same manual work: look up orders, answer the same policy questions, qualify
the same kind of leads, and copy data into the CRM.

The common "AI chatbot" answer to this problem is a thin wrapper around an LLM
that produces plausible-sounding but unverifiable text. That doesn't work for a
business that needs reliable answers and auditable actions.

## Solution

AgentDesk AI is an AI customer operations platform where a tool-calling agent
works with a company's **real data, tools and workflows**:

- Answers support questions from a company knowledge base (RAG with citations)
- Looks up real customer and order records
- Qualifies leads with transparent scoring and syncs them to the CRM
- Escalates to humans for sensitive or low-confidence cases
- Drives n8n automations for follow-ups and notifications

## Architecture

A single Next.js application with a layered, domain-oriented structure:

```
Customer → WhatsApp / Web Chat → Application API → AI Agent Router
  → Tool calling → RAG / CRM / Orders / Tickets → Structured result
  → AI response → Customer
```

Provider abstractions (`LLMProvider`, `CRMProvider`, `VectorStore`) keep
business logic decoupled from any vendor, so the same system runs in a fully
offline deterministic demo mode or against live OpenAI/HubSpot/pgvector.

## Important engineering problems solved

**Reliable tool calling.** Tools have Zod schemas; arguments are validated
before execution, and every answer is backed by a real tool result. The model
cannot invent order numbers or customer data.

**Duplicate prevention.** WhatsApp webhooks and background jobs are idempotent —
a unique key means a duplicate delivery produces no duplicate side effect.

**External API failures.** A database-backed job queue applies exponential
backoff, retries, and a dead-letter state. HubSpot 429s and n8n outages don't
corrupt state.

**Human escalation.** Sensitive actions (refunds above a configured threshold),
low confidence, and explicit human requests all escalate with a concise
decision summary — no hidden chain-of-thought exposed.

**Knowledge retrieval.** Documents are chunked and embedded; retrieval is
threshold-gated, and the agent refuses to answer confidently when sources are
weak, returning citations instead.

**CRM synchronization.** Contact and deal creation happen through a provider
interface, so HubSpot can be swapped for a demo provider without touching
business logic.

**Workflow visibility.** Every AI request, tool call, CRM sync and webhook is
audit-logged with status, latency and retry count.

## Testing

- **Vitest** unit tests for chunking, embeddings, intent classification, lead
  scoring and settings.
- **67-scenario AI evaluation suite** measuring intent accuracy, tool-selection
  accuracy and escalation correctness.

## Measured results

> These are the only numbers reported, and they come from actual runs of the
> evaluation suite against the deterministic reference provider. No production
> revenue, savings or usage figures are claimed.

| Metric | Result |
| --- | --- |
| Evaluation scenarios | 67 |
| Intent classification accuracy | 100% |
| Tool selection accuracy | 100% |
| Escalation correctness | 100% |
| Average decision latency (deterministic provider) | < 1 ms |

Note: these metrics validate the deterministic decision layer (intent, tool
routing, escalation). Live-model accuracy depends on the chosen provider and
can be measured by running the same suite with `OPENAI_API_KEY` set.

## Built with

Next.js · React · TypeScript · Tailwind CSS · Prisma · PostgreSQL/pgvector ·
OpenAI · n8n · WhatsApp Cloud API · HubSpot · Vitest · Playwright
