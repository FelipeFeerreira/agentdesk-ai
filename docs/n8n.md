# n8n automation

AgentDesk AI integrates with n8n in **both directions**, through a single
versioned contract.

## Architecture

```
AgentDesk (AI agent persists business state)
   │  emits ONE versioned event
   ▼
POST N8N_WEBHOOK_URL  (HMAC + shared-secret header)
   │
   ▼
n8n entry workflow  →  Validate Event  →  Switch(event.type)
   ├── LEAD_QUALIFIED     → sub-workflow: HubSpot upsert → deal → association → Slack
   ├── SUPPORT_ESCALATED  → sub-workflow: Slack notify
   ├── LEAD_FOLLOW_UP     → sub-workflow: wait → Slack notify
   └── KNOWLEDGE_UPDATE   → sub-workflow: POST /api/webhooks/n8n (ingestion)
```

- **One entry endpoint.** `N8N_WEBHOOK_URL` is the single automation endpoint.
- **One owner per side effect.** HubSpot writes for qualified leads are owned by
  the n8n workflow — the AI agent never writes HubSpot directly, so a record can
  never be created twice.

## Event contract

Every event is a versioned envelope (see `src/lib/automation/events.ts`, validated
with Zod on both sides):

```json
{
  "eventId": "evt_...",
  "type": "LEAD_QUALIFIED",
  "version": 1,
  "organizationId": "...",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "payload": { "...": "type-specific" }
}
```

Payload shapes:

| type | payload |
| --- | --- |
| `LEAD_QUALIFIED` | `leadId, conversationId, firstName?, lastName?, email, phone?, company?, companySize?, budget?, timeline?, problem?, score` |
| `SUPPORT_ESCALATED` | `conversationId, escalationId?, reason, summary, customerEmail?, priority` |
| `LEAD_FOLLOW_UP` | `leadId, email, company?, followUpDelayHours` |
| `KNOWLEDGE_UPDATE` | `title, content, source, documentId?, contentHash?` |

Outbound requests carry: `x-agentdesk-signature` (HMAC-SHA256 of the body),
`x-agentdesk-secret` (shared secret), `x-agentdesk-event`, `x-agentdesk-version`.
The inbound webhook (`/api/webhooks/n8n`) verifies the HMAC when
`N8N_WEBHOOK_SECRET` is set.

## Workflows

`n8n/workflows/`:

| File | Role |
| --- | --- |
| `automation-entry.json` | Single webhook → Validate → Switch → Execute Sub-workflow |
| `qualified-lead.json` | Sub-workflow: search/upsert HubSpot contact → deal → association → Slack |
| `support-escalation.json` | Sub-workflow: notify support |
| `lead-follow-up.json` | Sub-workflow: wait → notify |
| `knowledge-base-update.json` | Sub-workflow: send document to the ingestion endpoint |

Sub-workflows start with a **When Executed by Another Workflow** trigger and
consume `$json.payload`.

## Importing into n8n

1. Install/launch n8n (`npx n8n` or Docker).
2. **Import** all five JSON files from `n8n/workflows/`.
3. Create credentials:
   - **Header Auth** (`httpHeaderAuth`) named e.g. `AgentDesk Secret` with
     `Name: x-agentdesk-secret`, `Value: <N8N_WEBHOOK_SECRET>` — set it on the
     entry webhook node **and** use it (or a HubSpot Bearer header credential)
     for the HubSpot HTTP nodes.
   - **Slack** (`slackApi`).
4. In `automation-entry.json`, open each **→ …** node and select the matching
   sub-workflow (import assigns new IDs, so re-link them once).
5. Set n8n environment variables:
   | Variable | Used by |
   | --- | --- |
   | `HUBSPOT_DEAL_PIPELINE_ID` | qualified-lead |
   | `HUBSPOT_DEAL_STAGE_ID` | qualified-lead |
   | `SLACK_CHANNEL_ID` | qualified-lead / support-escalation / lead-follow-up |
   | `APP_URL` | knowledge-base-update |
   | `N8N_WEBHOOK_SECRET` | knowledge-base-update (callback header) |
6. Activate the entry workflow and copy its **Production URL** into the app's
   `N8N_WEBHOOK_URL`.

In demo mode (no `N8N_WEBHOOK_URL`), events are recorded locally and labelled as
simulated.

## The job queue

Outbound events go through the database-backed job runner
(`lib/automation/jobs.ts`): retries with exponential backoff, idempotency via
`idempotencyKey`, dead-letter for exhausted retries, and payload validation
before dispatch (invalid payloads move the job to `NEEDS_REVIEW`). In production,
drive `processDueJobs()` from a scheduler (e.g. Vercel Cron calling
`/api/automations/run`).
