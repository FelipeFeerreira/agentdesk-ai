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

  if (status !== "OPEN") return null;

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    try {
      await fetch(`/api/escalations/${escalationId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2 pt-1">
      <Button size="sm" variant="primary" disabled={busy} onClick={() => decide("approve")}>
        Approve action
      </Button>
      <Button size="sm" variant="danger" disabled={busy} onClick={() => decide("reject")}>
        Reject
      </Button>
    </div>
  );
}
