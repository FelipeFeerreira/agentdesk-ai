import Link from "next/link";
import {
  Sparkles,
  Workflow,
  Database,
  MessageSquare,
  ShieldCheck,
  BarChart3,
  ArrowRight,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-ink-900">
      {/* Nav */}
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">AgentDesk AI</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/chat" className="text-sm font-medium text-ink-600 hover:text-ink-900">
            Try the demo
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-700"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
          AI customer operations platform
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          AI agents that actually work with your business.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-500">
          Customer support, lead qualification and business automation connected to your real
          data, tools and workflows — not just a chatbot.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Try the live demo <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            View the dashboard
          </Link>
        </div>
      </section>

      {/* Workflow */}
      <section className="border-y border-ink-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight">How it works</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-ink-500">
            Every message flows through a tool-calling agent that works with real data.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-5">
            {[
              { label: "Customer", sub: "WhatsApp or web chat" },
              { label: "Application API", sub: "Ingest & idempotency" },
              { label: "AI Agent", sub: "Intent + tool calling" },
              { label: "Tools & data", sub: "RAG, CRM, orders" },
              { label: "Response", sub: "Structured result" },
            ].map((s, i) => (
              <div key={s.label} className="relative rounded-xl border border-ink-200 bg-white p-4">
                <div className="text-xs font-semibold text-brand-600">Step {i + 1}</div>
                <div className="mt-1 font-medium text-ink-900">{s.label}</div>
                <div className="text-xs text-ink-500">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">Built for real operations</h2>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              icon: MessageSquare,
              title: "Tool-calling agent",
              desc: "Orders, customers, tickets and refunds are resolved through validated tools — the model never invents data.",
            },
            {
              icon: Database,
              title: "RAG knowledge base",
              desc: "Policies and docs are chunked, embedded and retrieved with source citations.",
            },
            {
              icon: Workflow,
              title: "n8n automations",
              desc: "Qualified leads, escalations and follow-ups flow through documented, importable workflows.",
            },
            {
              icon: ShieldCheck,
              title: "Human-in-the-loop",
              desc: "Sensitive actions and low-confidence cases escalate for review with a clear decision summary.",
            },
            {
              icon: BarChart3,
              title: "Observability",
              desc: "Every tool call, CRM sync and webhook is logged with status, latency and retries.",
            },
            {
              icon: Sparkles,
              title: "Measured, not claimed",
              desc: "An evaluation suite runs 80+ scenarios and reports real accuracy, latency and cost.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-ink-200 bg-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-ink-900">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ink-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">See the agent in action</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-ink-500">
            No signup, no API keys — the demo runs fully offline with deterministic AI behaviour.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Open web chat demo
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              Explore the dashboard
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-8 text-center text-xs text-ink-400">
        AgentDesk AI — a full-stack AI customer operations platform. Demo data is simulated and
        clearly labelled.
      </footer>
    </div>
  );
}
