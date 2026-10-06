# Integrations

All external systems are reached through provider abstractions, so the
application runs fully offline in demo mode and can switch to live providers by
setting environment variables.

## HubSpot CRM

`lib/crm/provider.ts` defines `CRMProvider`; `lib/crm/hubspot.ts` is the real
implementation (v3 REST API), `lib/crm/demo.ts` is the labelled demo.

Supported operations: create/update/search contact, create/update deal,
associate contact with deal.

**Enable:** set `HUBSPOT_ACCESS_TOKEN` (a HubSpot private app token with
`crm.objects.contacts` and `crm.objects.deals` scopes).

HubSpot-specific behaviour that the job runner relies on: `429` responses throw
`HubSpotRateLimitError`, which the retry/backoff policy handles.

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
