"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ConversationActions({
  conversationId,
  status,
  customerEmail,
}: {
  conversationId: string;
  status: string;
  customerEmail: string;
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Request failed (HTTP ${res.status}).`);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error. Please retry.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(returnToAi: boolean) {
    const ok = await post(`/api/conversations/${conversationId}/reply`, {
      content,
      returnToAi,
    });
    // Only clear the textarea on success — never lose a message that failed.
    if (ok) setContent("");
  }

  const isHuman = status === "HUMAN_ACTIVE";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!isHuman ? (
          <Button variant="secondary" disabled={busy} onClick={() => post(`/api/conversations/${conversationId}/status`, { status: "HUMAN_ACTIVE" })}>
            Take over
          </Button>
        ) : (
          <Button variant="outline" disabled={busy} onClick={() => post(`/api/conversations/${conversationId}/status`, { status: "AI_ACTIVE" })}>
            Return to AI
          </Button>
        )}
        <Button variant="outline" disabled={busy} onClick={() => post(`/api/conversations/${conversationId}/status`, { status: "RESOLVED" })}>
          Mark resolved
        </Button>
        <Button variant="primary" onClick={() => setReplying((r) => !r)}>
          {replying ? "Cancel" : "Reply as human"}
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {replying && (
        <div className="rounded-lg border border-ink-200 bg-white p-3 shadow-[var(--shadow-pop)]">
          <label htmlFor="human-reply" className="sr-only">
            Reply to the customer
          </label>
          <textarea
            id="human-reply"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Write a reply to the customer…"
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" disabled={busy || !content.trim()} onClick={() => sendReply(false)}>
              Send
            </Button>
            <Button size="sm" variant="ghost" disabled={busy || !content.trim()} onClick={() => sendReply(true)}>
              Send & return to AI
            </Button>
          </div>
        </div>
      )}

      {customerEmail && <p className="text-xs text-ink-400">Customer: {customerEmail}</p>}
    </div>
  );
}
