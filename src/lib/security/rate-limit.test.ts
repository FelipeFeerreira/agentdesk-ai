import { describe, it, expect, vi, afterEach } from "vitest";
import { rateLimit, clientKey } from "./rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("allows requests up to the limit, then blocks", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("uses independent buckets per key", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(rateLimit(a, 1, 60_000).ok).toBe(true);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    const key = `win-${Math.random()}`;
    expect(rateLimit(key, 1, 1000).ok).toBe(true);
    expect(rateLimit(key, 1, 1000).ok).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit(key, 1, 1000).ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first x-forwarded-for address", () => {
    const req = new Request("http://localhost/api/chat", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(clientKey(req, "chat", "v1")).toBe("chat:203.0.113.5:v1");
  });

  it("falls back to x-real-ip then unknown", () => {
    const realIp = new Request("http://localhost/api/chat", { headers: { "x-real-ip": "198.51.100.7" } });
    expect(clientKey(realIp, "login")).toBe("login:198.51.100.7:");
    const none = new Request("http://localhost/api/chat");
    expect(clientKey(none, "login")).toBe("login:unknown:");
  });
});
