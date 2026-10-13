"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertCircle } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  agent?: boolean;
}

function getVisitorId(): string {
  const key = "agentdesk_visitor";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `web_${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

const SUGGESTIONS = [
  "Where is order #4582?",
  "What is your refund policy?",
  "I run a 25-person company and want AI customer support.",
  "I want to speak to a human.",
  "I need a $500 refund.",
];

export function WebChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const visitorIdRef = useRef<string>("");
  // The in-flight send id, reused on retry so a failure never double-posts.
  const pendingRef = useRef<{ clientMessageId: string; text: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    visitorIdRef.current = getVisitorId();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const sync = useCallback(async (cid: string) => {
    const res = await fetch(
      `/api/chat/messages?visitorId=${encodeURIComponent(visitorIdRef.current)}&conversationId=${encodeURIComponent(cid)}`,
    );
    if (!res.ok) return;
    const data = await res.json();
    setMessages(
      (data.messages ?? []).map((m: { role: string; content: string }) => ({
        role: m.role === "CUSTOMER" ? "user" : "assistant",
        content: m.content,
        agent: m.role === "HUMAN",
      })),
    );
  }, []);

  // Poll while a conversation exists so human-agent replies reach the customer.
  useEffect(() => {
    if (!conversationId) return;
    const id = setInterval(() => void sync(conversationId), 4000);
    return () => clearInterval(id);
  }, [conversationId, sync]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setStarted(true);
    setError(null);

    const cid = pendingRef.current?.clientMessageId ?? crypto.randomUUID();
    pendingRef.current = { clientMessageId: cid, text };
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: visitorIdRef.current, clientMessageId: cid, message: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please retry.");
        // Keep the text and the same send id so retry is safe.
        setInput(text);
        return;
      }
      const data = await res.json();
      pendingRef.current = null;
      if (data.conversationId) {
        setConversationId(data.conversationId);
        await sync(data.conversationId);
      } else if (data.reply) {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setError("Network error. Please retry.");
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4 thin-scroll">
        {!started && (
          <div className="space-y-2">
            <p className="text-sm text-ink-500">Try one of these demo scenarios:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-left text-sm text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%]">
              {m.agent && (
                <div className="mb-1 text-[11px] font-medium text-emerald-700">Support agent</div>
              )}
              <div
                className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-brand-600 text-white"
                    : m.agent
                      ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                      : "bg-ink-100 text-ink-900"
                }`}
              >
                {m.content}
              </div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="mb-3 flex justify-start">
            <div className="flex gap-1 rounded-2xl bg-ink-100 px-4 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:240ms]" />
            </div>
          </div>
        )}
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-ink-200 p-3"
      >
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the AI agent…"
            aria-label="Message the AI agent"
            className="h-10 min-w-0 flex-1 rounded-lg border border-ink-200 px-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            Send
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-400">
          <Sparkles className="h-3 w-3" /> Powered by AgentDesk AI · demo mode
        </p>
      </form>
    </div>
  );
}
