"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * POST-based sign-out. Uses a button (not a prefetchable Link to a GET route)
 * so loading a dashboard page can never clear the session.
 */
export function SignOutButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={signOut} disabled={busy} className={className}>
      {children}
    </button>
  );
}
