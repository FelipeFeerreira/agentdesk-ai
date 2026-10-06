# Architecture

## Overview

AgentDesk AI is a single Next.js application (App Router) with a layered,
domain-oriented structure. Business logic lives in `src/lib/*`, UI in
`src/app/*` and `src/components/*`, and external systems are reached through
small provider abstractions.

```
src/
  app/                    # Routes (pages + API)
    (app)/                # Authenticated dashboard
    api/                  # Route handlers (chat, auth, webhooks, ...)
    chat/                 # Public web chat demo
    login/                # Auth
  lib/
    ai/                   # Agent loop, providers, tools, lead qualification
    auth/                 # Sessions, password hashing, guards
    automation/           # Background jobs + n8n dispatch
    crm/                  # CRM provider abstraction (HubSpot + demo)
    eval/                 # Evaluation dataset + evaluator
    messaging/            # Inbox ingestion + WhatsApp
    observability/        # Audit logging
    queries/              # Read queries for dashboard pages
    rag/                  # Ingestion, chunking, embedding, retrieval
    seed/                 # Demo documents
    db.ts                 # Prisma singleton
    settings.ts           # Typed org settings + defaults
  components/             # UI primitives + shared components
  prisma/                 # Schema, seed, pgvector migration
  n8n/workflows/          # Importable n8n workflow JSON
  docs/                   # Documentation
```

## Request flow

1. A customer message arrives via **Web Chat** (`/api/chat`) or **WhatsApp**
   (`/api/webhooks/whatsapp`).
2. `handleIncomingMessage` (`lib/messaging/inbox.ts`) applies idempotency,
   resolves the customer, and resolves/creates an open conversation.
3. The **AI agent** (`lib/ai/agent.ts`) classifies intent, plans the next step,
   and executes validated tool calls against real data.
4. Side effects (CRM sync, automation) are dispatched through provider
   abstractions and/or enqueued as background jobs.
5. The agent writes the assistant reply and any tool-call/escalation records.

## Key architectural decisions

| Decision | Rationale |
| --- | --- |
| SQLite for demo, PostgreSQL/pgvector for production | Runs anywhere with zero dependencies; production path documented and provider-abstracted. |
| `LLMProvider` / `CRMProvider` / `VectorStore` / channel abstractions | Business logic never depends on a specific vendor; demo mode = real code, simulated integrations. |
| Deterministic demo provider | The whole product is demonstrable offline, and the evaluation suite is reproducible. |
| Database-backed job queue | Retries/idempotency/dead-letter without Redis or microservices. |
| Custom session auth | Signed httpOnly cookies + bcrypt; fewer moving parts than an OAuth dependency for a single-workspace product. |

## Data model

Core entities: `Organization`, `User`, `Customer`, `Order`, `Conversation`,
`Message`, `ToolCall`, `Lead`, `Ticket`, `KnowledgeDocument`, `KnowledgeChunk`,
`Integration`, `WorkflowRun`, `Escalation`, `AuditLog`, `EvaluationRun`,
`EvaluationCase`. See `prisma/schema.prisma` for full definitions and relations.
