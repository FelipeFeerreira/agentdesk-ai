"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

type Settings = {
  ai: {
    model: string;
    temperature: number;
    maxResponseLength: number;
    escalationConfidenceThreshold: number;
  };
  business: {
    supportHours: string;
    refundApprovalThresholdUsd: number;
    defaultLanguage: string;
  };
  knowledge: {
    retrievalLimit: number;
    similarityThreshold: number;
  };
  automation: {
    followUpDelayHours: number;
    maxRetries: number;
  };
};

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function set(path: string, value: string | number) {
    const [section, key] = path.split(".");
    setForm((prev) => ({
      ...prev,
      [section]: { ...(prev[section as keyof Settings] as object), [key]: value },
    }));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Failed to save.");
        return;
      }
      setMessage("Settings saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent & business rules</CardTitle>
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </CardHeader>
      <CardContent>
        {message && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Section title="AI">
            <Field label="Model">
              <Input value={form.ai.model} onChange={(e) => set("ai.model", e.target.value)} />
            </Field>
            <Field label="Temperature">
              <Input type="number" step="0.1" min="0" max="2" value={form.ai.temperature} onChange={(e) => set("ai.temperature", Number(e.target.value))} />
            </Field>
            <Field label="Max response length">
              <Input type="number" value={form.ai.maxResponseLength} onChange={(e) => set("ai.maxResponseLength", Number(e.target.value))} />
            </Field>
            <Field label="Escalation confidence threshold">
              <Input type="number" step="0.05" min="0" max="1" value={form.ai.escalationConfidenceThreshold} onChange={(e) => set("ai.escalationConfidenceThreshold", Number(e.target.value))} />
            </Field>
          </Section>

          <Section title="Business">
            <Field label="Support hours">
              <Input value={form.business.supportHours} onChange={(e) => set("business.supportHours", e.target.value)} />
            </Field>
            <Field label="Refund approval threshold (USD)">
              <Input type="number" min="0" value={form.business.refundApprovalThresholdUsd} onChange={(e) => set("business.refundApprovalThresholdUsd", Number(e.target.value))} />
            </Field>
            <Field label="Default language">
              <Input value={form.business.defaultLanguage} onChange={(e) => set("business.defaultLanguage", e.target.value)} />
            </Field>
          </Section>

          <Section title="Knowledge">
            <Field label="Retrieval limit (chunks)">
              <Input type="number" min="1" value={form.knowledge.retrievalLimit} onChange={(e) => set("knowledge.retrievalLimit", Number(e.target.value))} />
            </Field>
            <Field label="Similarity threshold">
              <Input type="number" step="0.05" min="0" max="1" value={form.knowledge.similarityThreshold} onChange={(e) => set("knowledge.similarityThreshold", Number(e.target.value))} />
            </Field>
          </Section>

          <Section title="Automation">
            <Field label="Follow-up delay (hours)">
              <Input type="number" min="0" value={form.automation.followUpDelayHours} onChange={(e) => set("automation.followUpDelayHours", Number(e.target.value))} />
            </Field>
            <Field label="Max retries">
              <Input type="number" min="0" value={form.automation.maxRetries} onChange={(e) => set("automation.maxRetries", Number(e.target.value))} />
            </Field>
          </Section>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
