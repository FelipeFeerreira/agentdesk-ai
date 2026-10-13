"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[app] route error:", error.message);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-ink-200 bg-white px-6 py-16 text-center">
      <h2 className="text-sm font-semibold text-ink-900">Something went wrong</h2>
      <p className="mt-1 max-w-sm text-sm text-ink-500">
        This section failed to load. You can retry, or head back to the overview.
      </p>
      <div className="mt-4 flex gap-2">
        <Button onClick={reset} size="sm">Try again</Button>
        <Button variant="outline" size="sm" onClick={() => router.push("/overview")}>
          Go to overview
        </Button>
      </div>
    </div>
  );
}
