"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DocumentRowActions({ documentId }: { documentId: string }) {
  const router = useRouter();

  async function remove() {
    if (!confirm("Delete this document and its indexed chunks?")) return;
    await fetch(`/api/knowledge/documents?id=${documentId}`, { method: "DELETE" });
    router.refresh();
  }

  async function reindex() {
    await fetch(`/api/knowledge/documents/${documentId}/reindex`, { method: "POST" });
    router.refresh();
  }

  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={reindex}>
        Reindex
      </Button>
      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={remove}>
        Delete
      </Button>
    </div>
  );
}
