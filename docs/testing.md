# Testing

## Unit tests (Vitest)

```
npm run test
```

| Suite | What it covers |
| --- | --- |
| `lib/rag/chunker.test.ts` | Chunk splitting, normalization, hard caps |
| `lib/rag/embedder.test.ts` | Embedding dimension/normalization, semantic ranking, stemming |
| `lib/ai/providers/demo.test.ts` | Order/amount extraction, intent classification |
| `lib/ai/lead.test.ts` | Lead scoring, field extraction, missing-field detection |
| `lib/settings.test.ts` | Settings parsing, defaults, validation, merging |

## AI evaluation suite

The evaluation suite (`lib/eval/`) runs **67 predefined scenarios** against the
agent's decision layer and persists results for the dashboard. Run it from the
**Evaluations** page or the API (`POST /api/evaluations/run`).

Measured metrics (only real run results are displayed):

- Intent classification accuracy
- Tool selection accuracy
- Escalation correctness
- Average latency
- Estimated cost (explicit demo model)

Because it runs against the deterministic demo provider, results are
reproducible with no network or API key. When `OPENAI_API_KEY` is set, the same
suite runs against the live provider.

## Type checking & lint

```
npm run typecheck
npm run lint
```

## End-to-end (Playwright)

```
npm run e2e
```

Covers the key flow: login → dashboard → web chat → agent response. Requires a
running app (`npm run dev` / `npm run start`).

## Error-handling scenarios

The following failure modes are deliberately exercised across the agent, job
runner and webhook handlers (see the corresponding code paths):

1. OpenAI unavailable → falls back to the demo provider
2. HubSpot 500 → job retries then dead-letters
3. HubSpot 429 → `HubSpotRateLimitError` → backoff retry
4. Duplicate webhook → idempotency key dedup
5. Invalid tool arguments → Zod validation failure (logged, not crash)
6. Missing order id → agent asks for it
7. Customer does not exist → created on first contact
8. Knowledge base no answer → agent says so instead of hallucinating
9. Malformed webhook → 400 response
10. Document ingestion failure → document marked `FAILED`
11. n8n unavailable → job retries
12. Temporary DB failure → surfaced via error responses + audit log
