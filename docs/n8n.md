# n8n automation

AgentDesk AI integrates with n8n in **both directions**:

- **Outbound** — the app dispatches events to n8n via `triggerN8n()`
  (`lib/automation/n8n.ts`) using `N8N_WEBHOOK_URL`.
- **Inbound** — n8n calls the app's webhook (`/api/webhooks/n8n`) for flows like
  document ingestion.

When `N8N_WEBHOOK_URL` is unset (demo mode), events are recorded locally and
clearly labelled as simulated.

## Workflows

Four importable workflows ship in `n8n/workflows/`:

### 1. Qualified Lead (`qualified-lead.json`)

```
AI qualifies lead → Webhook → HubSpot Create Contact → HubSpot Create Deal → Slack notify
```

### 2. Support Escalation (`support-escalation.json`)

```
AI escalates → Webhook → Create ticket → Slack notify → track escalation
```

### 3. Knowledge Base Update (`knowledge-base-update.json`)

```
Google Drive file created → Download → extract → POST /api/webhooks/n8n (kb_ingestion) → embeddings
```

### 4. Lead Follow-up (`lead-follow-up.json`)

```
Webhook → Wait (follow-up delay) → Check CRM state → Slack notify → update status
```

## Importing into n8n

1. Install/launch n8n (`npx n8n` or Docker).
2. In n8n, **Workflows → Import from File**, select a JSON from `n8n/workflows/`.
3. Configure credentials (HubSpot, Slack, Google) in each node.
4. For outbound: copy the production webhook URL of the "Qualified Lead" /
   "Support Escalation" workflows into `N8N_WEBHOOK_URL`.
5. For inbound: set `APP_URL` (used by the workflows) to your deployed app URL.

## The job queue

`triggerN8n()` is wrapped by a database-backed job runner
(`lib/automation/jobs.ts`) that provides retries with exponential backoff,
idempotency via `idempotencyKey`, and a dead-letter state for manual retry.
In production, drive `processDueJobs()` from a scheduler (e.g. Vercel Cron
calling `/api/automations/run`).
