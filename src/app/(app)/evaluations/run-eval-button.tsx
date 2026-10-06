"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RunEvalButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/evaluations/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Evaluation failed.");
        return;
      }
      setMsg(
        `Completed ${data.total} cases · ${Math.round(data.metrics.intentAccuracy * 100)}% intent accuracy`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-ink-500">{msg}</span>}
      <Button onClick={run} disabled={busy}>
        {busy ? "Running…" : "Run evaluation"}
      </Button>
    </div>
  );
}
