import type {
  CRMContactInput,
  CRMDealInput,
  CRMProvider,
  CRMResult,
} from "./provider";

/**
 * HubSpot CRM provider via the v3 REST API.
 *
 * Requires HUBSPOT_ACCESS_TOKEN (a private app access token). Every call is
 * made with an explicit timeout and non-2xx responses are turned into typed
 * errors so the caller (the job runner) can apply retry/backoff policy.
 */
export class HubSpotProvider implements CRMProvider {
  name = "hubspot";
  isDemo = false;

  private get baseUrl() {
    return "https://api.hubapi.com";
  }

  private get headers() {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not configured");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) {
      throw new HubSpotRateLimitError();
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HubSpot ${method} ${path} failed (${res.status}): ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async createContact(orgId: string, input: CRMContactInput): Promise<CRMResult> {
    const data = await this.request<{ id: string }>("POST", "/crm/v3/objects/contacts", {
      properties: {
        email: input.email,
        firstname: input.firstName ?? "",
        lastname: input.lastName ?? "",
        phone: input.phone ?? "",
        company: input.company ?? "",
      },
    });
    return { ok: true, id: data.id };
  }

  async updateContact(
    orgId: string,
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

  async searchContact(orgId: string, email: string) {
    const data = await this.request<{ results: { id: string }[] }>(
      "POST",
      "/crm/v3/objects/contacts/search",
      {
        filterGroups: [
          { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
        ],
      },
    );
    const id = data.results[0]?.id;
    return { ok: true, id, found: !!id };
  }

  async createDeal(orgId: string, input: CRMDealInput): Promise<CRMResult> {
    const data = await this.request<{ id: string }>("POST", "/crm/v3/objects/deals", {
      properties: {
        dealname: input.name,
        ...(input.amount ? { amount: String(input.amount) } : {}),
        ...(input.stage ? { dealstage: input.stage } : {}),
      },
    });
    return { ok: true, id: data.id };
  }

  async updateDeal(orgId: string, dealId: string, input: Partial<CRMDealInput>) {
    await this.request("PATCH", `/crm/v3/objects/deals/${dealId}`, {
      properties: {
        ...(input.name ? { dealname: input.name } : {}),
        ...(input.amount ? { amount: String(input.amount) } : {}),
        ...(input.stage ? { dealstage: input.stage } : {}),
      },
    });
    return { ok: true, id: dealId };
  }

  async associateContactWithDeal(orgId: string, contactId: string, dealId: string) {
    await this.request(
      "PUT",
      `/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`,
    );
    return { ok: true };
  }
}

export class HubSpotRateLimitError extends Error {
  constructor() {
    super("HubSpot rate limit reached (HTTP 429)");
    this.name = "HubSpotRateLimitError";
  }
}
