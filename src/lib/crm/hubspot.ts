import type {
  CRMContactInput,
  CRMDealInput,
  CRMProvider,
  CRMResult,
} from "./provider";

export class HubSpotRateLimitError extends Error {
  constructor() {
    super("HubSpot rate limit reached (HTTP 429)");
    this.name = "HubSpotRateLimitError";
  }
}

export class HubSpotApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HubSpotApiError";
  }
}

/** Minimal fetch signature so tests can inject a mock. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HubSpotOptions {
  maxAttempts?: number;
  retryBaseMs?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: FetchLike;
}

/**
 * HubSpot CRM provider via the v3/v4 REST API.
 *
 * Reliability guarantees:
 *  - search-first upsert so repeated syncs do not create duplicate contacts
 *  - retry with exponential backoff on 429 / 5xx / network errors, honouring
 *    the `Retry-After` header; non-retryable 4xx fail fast
 *  - deals use an explicitly configured pipeline/stage (never a hardcoded value)
 *  - associations use the v4 "default" association endpoint
 *
 * Requires HUBSPOT_ACCESS_TOKEN (a private app access token).
 */
export class HubSpotProvider implements CRMProvider {
  name = "hubspot";
  isDemo = false;

  private maxAttempts: number;
  private retryBaseMs: number;
  private fetchImpl: FetchLike;

  constructor(opts: HubSpotOptions = {}) {
    this.maxAttempts = opts.maxAttempts ?? Number(process.env.HUBSPOT_MAX_ATTEMPTS ?? 4);
    this.retryBaseMs = opts.retryBaseMs ?? Number(process.env.HUBSPOT_RETRY_BASE_MS ?? 500);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private get baseUrl() {
    return process.env.HUBSPOT_BASE_URL ?? "https://api.hubapi.com";
  }

  private get headers() {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not configured");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  /** Deal pipeline/stage are explicit configuration, not assumptions. */
  private get dealPipelineId() {
    return process.env.HUBSPOT_DEAL_PIPELINE_ID || undefined;
  }
  private get dealStageId() {
    return process.env.HUBSPOT_DEAL_STAGE_ID || undefined;
  }

  private backoffMs(attempt: number, retryAfterHeader: string | null): number {
    if (retryAfterHeader) {
      const seconds = Number(retryAfterHeader);
      if (!Number.isNaN(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
    }
    return Math.min(this.retryBaseMs * 2 ** (attempt - 1), 15_000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let attempt = 0;
    // Retry loop: only 429/5xx/network failures are retried.
    for (;;) {
      attempt += 1;
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        if (attempt >= this.maxAttempts) {
          throw new Error(`HubSpot ${method} ${path} network error: ${e instanceof Error ? e.message : "unknown"}`);
        }
        await this.sleep(this.backoffMs(attempt, null));
        continue;
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= this.maxAttempts) {
          if (res.status === 429) throw new HubSpotRateLimitError();
          throw new HubSpotApiError(res.status, `HubSpot ${method} ${path} failed (${res.status}) after ${attempt} attempts`);
        }
        await this.sleep(this.backoffMs(attempt, res.headers.get("retry-after")));
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // Non-retryable client errors (400/401/403/404/409) fail immediately.
        throw new HubSpotApiError(res.status, `HubSpot ${method} ${path} failed (${res.status}): ${text}`);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }
  }

  async createContact(_orgId: string, input: CRMContactInput): Promise<CRMResult> {
    const data = await this.request<{ id: string }>("POST", "/crm/v3/objects/contacts", {
      properties: {
        email: input.email,
        ...(input.firstName ? { firstname: input.firstName } : {}),
        ...(input.lastName ? { lastname: input.lastName } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.company ? { company: input.company } : {}),
      },
    });
    return { ok: true, id: data.id };
  }

  async updateContact(
    _orgId: string,
    contactId: string,
    input: Partial<CRMContactInput>,
  ): Promise<CRMResult> {
    await this.request("PATCH", `/crm/v3/objects/contacts/${contactId}`, {
      properties: {
        ...(input.email ? { email: input.email } : {}),
        ...(input.firstName ? { firstname: input.firstName } : {}),
        ...(input.lastName ? { lastname: input.lastName } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.company ? { company: input.company } : {}),
      },
    });
    return { ok: true, id: contactId };
  }

  async searchContact(_orgId: string, email: string): Promise<CRMResult & { found?: boolean }> {
    const data = await this.request<{ results: { id: string }[] }>(
      "POST",
      "/crm/v3/objects/contacts/search",
      {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      },
    );
    const id = data.results?.[0]?.id;
    return { ok: true, id, found: !!id };
  }

  /** Search-first upsert — the duplicate-prevention guarantee. */
  async upsertContact(orgId: string, input: CRMContactInput): Promise<CRMResult> {
    const existing = await this.searchContact(orgId, input.email);
    if (existing.found && existing.id) {
      await this.updateContact(orgId, existing.id, input);
      return { ok: true, id: existing.id };
    }
    return this.createContact(orgId, input);
  }

  async createDeal(_orgId: string, input: CRMDealInput): Promise<CRMResult> {
    const pipeline = this.dealPipelineId;
    const stage = input.stage ?? this.dealStageId;
    const data = await this.request<{ id: string }>("POST", "/crm/v3/objects/deals", {
      properties: {
        dealname: input.name,
        ...(input.amount ? { amount: String(input.amount) } : {}),
        ...(pipeline ? { pipeline } : {}),
        // Only send a stage when one is explicitly configured/built-in.
        ...(stage ? { dealstage: stage } : {}),
      },
    });
    return { ok: true, id: data.id };
  }

  async updateDeal(_orgId: string, dealId: string, input: Partial<CRMDealInput>) {
    await this.request("PATCH", `/crm/v3/objects/deals/${dealId}`, {
      properties: {
        ...(input.name ? { dealname: input.name } : {}),
        ...(input.amount ? { amount: String(input.amount) } : {}),
        ...(input.stage ? { dealstage: input.stage } : {}),
      },
    });
    return { ok: true, id: dealId };
  }

  async associateContactWithDeal(_orgId: string, contactId: string, dealId: string) {
    // v4 "default" association endpoint — avoids hardcoding numeric type ids.
    await this.request(
      "PUT",
      `/crm/v4/objects/deals/${dealId}/associations/default/contacts/${contactId}`,
    );
    return { ok: true };
  }
}
