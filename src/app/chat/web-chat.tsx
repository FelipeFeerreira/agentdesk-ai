"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setStarted(true);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId(), message: text }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? "Sorry, something went wrong." },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Unable to reach the agent. Please try again." },
      ]);
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
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-900"
              }`}
            >
              {m.content}
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
            className="h-10 flex-1 rounded-lg border border-ink-200 px-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
