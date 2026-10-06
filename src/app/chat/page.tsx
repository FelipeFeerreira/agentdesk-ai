import Link from "next/link";
import { Sparkles } from "lucide-react";
import { WebChat } from "./web-chat";

export default function ChatPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <header className="flex h-14 items-center justify-between border-b border-ink-200 bg-white px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-ink-900">AgentDesk AI</span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
            Demo
          </span>
        </div>
        <Link
          href="/overview"
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Open admin dashboard →
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-ink-900">Web Chat</h1>
          <p className="text-sm text-ink-500">
            Talk to the AI agent — order tracking, refunds, knowledge base and lead qualification.
          </p>
        </div>
        <div className="flex-1 rounded-xl border border-ink-200 bg-white shadow-[var(--shadow-card)]">
          <WebChat />
        </div>
      </main>
    </div>
  );
}
