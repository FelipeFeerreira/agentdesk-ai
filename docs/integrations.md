# Integrations

All external systems are reached through provider abstractions, so the
application runs fully offline in demo mode and can switch to live providers by
setting environment variables.

## HubSpot CRM

`lib/crm/provider.ts` defines `CRMProvider`; `lib/crm/hubspot.ts` is the real
implementation, `lib/crm/demo.ts` is the labelled demo.

> **Single ownership.** For qualified leads, HubSpot writes are owned by the
> **n8n automation**, not the AI agent. The agent persists the `Lead` and emits a
> `LEAD_QUALIFIED` event; the n8n workflow performs the contact upsert, deal
> creation and association. The agent never writes HubSpot directly, so records
> can never be created twice. `HubSpotProvider` is the reference adapter used by
> the provider tests and available for app-side operations.

Supported operations: create/update/search contact, **upsert** contact,
create/update deal, associate contact with deal.

**Enable:** set `HUBSPOT_ACCESS_TOKEN` (a HubSpot private app token with
`crm.objects.contacts` and `crm.objects.deals` scopes).

### Duplicate prevention

`CRMProvider.upsertContact()` searches by email first, then updates the existing
contact or creates a new one. The agent's `create_crm_contact` tool uses this, so
repeated syncs never create duplicate contacts.

### Retry & resilience

Every HubSpot call retries with exponential backoff on `429`, `5xx` and network
errors, honouring the `Retry-After` header. Non-retryable `4xx` (400/401/403/404)
fail fast without retrying. Exhausted `429`s raise `HubSpotRateLimitError`.
Tune with `HUBSPOT_MAX_ATTEMPTS` (default 4) and `HUBSPOT_RETRY_BASE_MS`
(default 500 ms).

### Pipeline / stage configuration

Deal stages are portal-specific, so **no stage is hardcoded**. Set
`HUBSPOT_DEAL_PIPELINE_ID` and `HUBSPOT_DEAL_STAGE_ID` to route deals into an
explicit pipeline/stage; if left blank, HubSpot applies the portal default.

### Associations

`associateContactWithDeal()` uses the HubSpot **v4 default association**
endpoint (`PUT /crm/v4/objects/deals/{id}/associations/default/contacts/{id}`),
avoiding hardcoded numeric association type ids.

No live HubSpot token is required for the app to run — without it, the labelled
`DemoCRMProvider` is used.

## WhatsApp Cloud API

`lib/messaging/whatsapp.ts` implements:

- **Webhook verification** — `GET` with `hub.mode` / `hub.verify_token` / `hub.challenge`
- **Signature validation** — HMAC SHA-256 of the raw body (`X-Hub-Signature-256`)
- **Inbound parsing** — extract text messages from the webhook payload
- **Outbound send** — Cloud API `messages` endpoint
- **Idempotency** — the WhatsApp message id is the idempotency key; duplicate
  deliveries are detected and skipped

**Configure (Meta):**

1. Create a Meta Business app, add the **WhatsApp** product.
2. Note the **Phone Number ID** and generate a permanent **access token**.
3. In **Webhooks**, subscribe to the `messages` field with your callback URL
   (`https://your-domain/api/webhooks/whatsapp`) and a verify token.
4. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
   `WHATSAPP_VERIFY_TOKEN`.

The web chat (`/chat`) provides the identical agent experience without any of
this — ideal for reviewers without WhatsApp credentials.

## Google Drive

The knowledge-ingestion endpoint (`/api/webhooks/n8n`) and the
`knowledge-base-update.json` n8n workflow document the Google Drive → ingestion
flow. Manual upload (PDF/TXT/Markdown) is fully implemented in the dashboard,
so the pipeline is demonstrable without Google credentials.

## Switching between demo and live

Integration mode is tracked per-`Integration` row and surfaced in the
**Settings** page. Demo integrations are always labelled and never presented as
real activity.
