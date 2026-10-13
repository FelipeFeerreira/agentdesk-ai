"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DecisionButtons({
  escalationId,
  status,
}: {
  escalationId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "OPEN") return null;

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/escalations/${escalationId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Request failed (HTTP ${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => decide("approve")}>
          Approve action
        </Button>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => decide("reject")}>
          Reject
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
