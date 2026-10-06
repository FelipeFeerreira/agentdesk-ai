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

Search-first, duplicate-safe flow with retries on every HubSpot call:

```
Webhook → Search Contact (by email)
        → Contact Found?
            ├─ yes → Update Contact
            └─ no  → Create Contact
        → Capture Contact → Create Deal → Associate Contact with Deal → Slack notify
```

- **No hardcoded deal stage.** The deal's `pipeline`/`dealstage` come from n8n
  environment variables `HUBSPOT_DEAL_PIPELINE_ID` / `HUBSPOT_DEAL_STAGE_ID` —
  set them to values valid in *your* portal, or clear the fields to use the
  portal default.
- **Duplicate prevention** via the search-before-create branch.
- **Associations** use the HubSpot v4 default association endpoint.
- Every HTTP node has `retryOnFail` (3 tries, 2s apart).

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
3. Create credentials and attach them to nodes:
   - **Header Auth** (`httpHeaderAuth`) named e.g. `HubSpot Bearer` with
     `Name: Authorization`, `Value: Bearer <HUBSPOT_ACCESS_TOKEN>` — used by the
     HTTP Request nodes.
   - **Slack** (`slackApi`) for notifications.
   - **Google Drive OAuth2** for the knowledge-base workflow.
4. Set n8n **environment variables** used by the workflows:
   | Variable | Used by |
   | --- | --- |
   | `HUBSPOT_DEAL_PIPELINE_ID` | qualified-lead (deal pipeline) |
   | `HUBSPOT_DEAL_STAGE_ID` | qualified-lead (deal stage) |
   | `SLACK_CHANNEL_ID` | qualified-lead / support-escalation |
   | `APP_URL` | knowledge-base-update / support-escalation (callbacks) |
5. For outbound: activate the workflow and copy its **Production URL** into the
   app's `N8N_WEBHOOK_URL`.
6. For inbound: set `APP_URL` to your deployed app URL.

The app posts `{ "type": "<workflow-type>", "payload": { ... } }` to
`N8N_WEBHOOK_URL`. See `lib/automation/n8n.ts` for the exact payload shape.

## The job queue

`triggerN8n()` is wrapped by a database-backed job runner
(`lib/automation/jobs.ts`) that provides retries with exponential backoff,
idempotency via `idempotencyKey`, and a dead-letter state for manual retry.
In production, drive `processDueJobs()` from a scheduler (e.g. Vercel Cron
calling `/api/automations/run`).
