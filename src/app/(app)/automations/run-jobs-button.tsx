"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RunJobsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/automations/run", { method: "POST" });
      const data = await res.json();
      alert(`Processed ${data.processed} due job(s).`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" onClick={run} disabled={busy}>
      {busy ? "Processing…" : "Run due jobs"}
    </Button>
  );
}
