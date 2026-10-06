import { describe, it, expect, vi, beforeEach } from "vitest";
import { HubSpotProvider, HubSpotRateLimitError, HubSpotApiError } from "./hubspot";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;
function mockFetch(impl: FetchImpl) {
  return vi.fn(impl);
}

beforeEach(() => {
  process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
  process.env.HUBSPOT_RETRY_BASE_MS = "1";
  process.env.HUBSPOT_MAX_ATTEMPTS = "4";
  delete process.env.HUBSPOT_DEAL_PIPELINE_ID;
  delete process.env.HUBSPOT_DEAL_STAGE_ID;
});

describe("HubSpotProvider.createContact", () => {
  it("creates a contact and returns its id", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ id: "c1" }));
    const r = await new HubSpotProvider({ fetchImpl }).createContact("org", {
      email: "a@b.com",
      firstName: "A",
    });
    expect(r).toEqual({ ok: true, id: "c1" });
    expect(fetchImpl.mock.calls[0][0]).toContain("/crm/v3/objects/contacts");
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
  });
});

describe("HubSpotProvider.upsertContact (duplicate prevention)", () => {
  it("updates an existing contact instead of creating a duplicate", async () => {
    const fetchImpl = mockFetch(async (url) => {
      if (url.includes("/search")) return jsonResponse({ results: [{ id: "c1" }] });
      return new Response(null, { status: 204 });
    });
    const r = await new HubSpotProvider({ fetchImpl }).upsertContact("org", {
      email: "a@b.com",
      company: "X",
    });
    expect(r.id).toBe("c1");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url2, init2] = fetchImpl.mock.calls[1];
    expect(url2).toContain("/contacts/c1");
    expect(init2.method).toBe("PATCH");
    // no create POST was issued
    const created = fetchImpl.mock.calls.some(
      ([url, init]) => init.method === "POST" && !String(url).includes("/search"),
    );
    expect(created).toBe(false);
  });

  it("creates a contact when none exists", async () => {
    const fetchImpl = mockFetch(async (url) => {
      if (url.includes("/search")) return jsonResponse({ results: [] });
      return jsonResponse({ id: "c2" });
    });
    const r = await new HubSpotProvider({ fetchImpl }).upsertContact("org", {
      email: "new@b.com",
    });
    expect(r.id).toBe("c2");
    expect(fetchImpl.mock.calls[1][1].method).toBe("POST");
  });
});

describe("HubSpotProvider retry policy", () => {
  it("retries on 429 and then succeeds", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return calls === 1 ? new Response("rate limited", { status: 429 }) : jsonResponse({ id: "c3" });
    });
    const r = await new HubSpotProvider({ fetchImpl, retryBaseMs: 1 }).createContact("org", {
      email: "a@b.com",
    });
    expect(r.id).toBe("c3");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(async () => {
      calls += 1;
      return calls === 1 ? new Response("boom", { status: 500 }) : jsonResponse({ id: "c4" });
    });
    const r = await new HubSpotProvider({ fetchImpl, retryBaseMs: 1 }).createContact("org", {
      email: "a@b.com",
    });
    expect(r.id).toBe("c4");
  });

  it("throws HubSpotRateLimitError when 429 persists", async () => {
    const fetchImpl = mockFetch(async () => new Response("rate limited", { status: 429 }));
    await expect(
      new HubSpotProvider({ fetchImpl, retryBaseMs: 1, maxAttempts: 3 }).createContact("org", {
        email: "a@b.com",
      }),
    ).rejects.toBeInstanceOf(HubSpotRateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable 4xx errors", async () => {
    const fetchImpl = mockFetch(async () => new Response("bad", { status: 400 }));
    await expect(
      new HubSpotProvider({ fetchImpl, retryBaseMs: 1 }).createContact("org", { email: "a@b.com" }),
    ).rejects.toBeInstanceOf(HubSpotApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("HubSpotProvider.createDeal (explicit pipeline/stage)", () => {
  it("uses the configured pipeline and stage", async () => {
    process.env.HUBSPOT_DEAL_PIPELINE_ID = "default";
    process.env.HUBSPOT_DEAL_STAGE_ID = "appointmentscheduled";
    const fetchImpl = mockFetch(async () => jsonResponse({ id: "d1" }));
    await new HubSpotProvider({ fetchImpl }).createDeal("org", { name: "Deal", amount: 100 });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body.properties.pipeline).toBe("default");
    expect(body.properties.dealstage).toBe("appointmentscheduled");
  });

  it("omits pipeline/stage when not configured (no invalid hardcoded value)", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ id: "d2" }));
    await new HubSpotProvider({ fetchImpl }).createDeal("org", { name: "Deal" });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body.properties.pipeline).toBeUndefined();
    expect(body.properties.dealstage).toBeUndefined();
  });
});

describe("HubSpotProvider.searchContact / association", () => {
  it("reports not found when there are no results", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ results: [] }));
    const r = await new HubSpotProvider({ fetchImpl }).searchContact("org", "x@y.com");
    expect(r.found).toBe(false);
    expect(r.id).toBeUndefined();
  });

  it("associates a contact with a deal via the v4 default endpoint", async () => {
    const fetchImpl = mockFetch(async () => new Response(null, { status: 204 }));
    const r = await new HubSpotProvider({ fetchImpl }).associateContactWithDeal("org", "c1", "d1");
    expect(r.ok).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toContain(
      "/crm/v4/objects/deals/d1/associations/default/contacts/c1",
    );
  });
});
