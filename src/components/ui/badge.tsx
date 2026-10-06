import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 border-ink-200",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

// --- Status → tone helpers (single source of truth) ---

export function conversationStatusTone(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "AI_ACTIVE":
      return { tone: "info", label: "AI Active" };
    case "WAITING":
      return { tone: "neutral", label: "Waiting" };
    case "RESOLVED":
      return { tone: "success", label: "Resolved" };
    case "NEEDS_HUMAN_REVIEW":
      return { tone: "warning", label: "Needs Review" };
    case "HUMAN_ACTIVE":
      return { tone: "brand", label: "Human Active" };
    case "ESCALATED":
      return { tone: "danger", label: "Escalated" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function leadStatusTone(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "NEW":
      return { tone: "neutral", label: "New" };
    case "UNQUALIFIED":
      return { tone: "neutral", label: "Unqualified" };
    case "NEEDS_MORE_INFO":
      return { tone: "info", label: "Needs Info" };
    case "QUALIFIED":
      return { tone: "success", label: "Qualified" };
    case "MEETING_SCHEDULED":
      return { tone: "brand", label: "Meeting Scheduled" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function ticketStatusTone(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "OPEN":
      return { tone: "info", label: "Open" };
    case "IN_PROGRESS":
      return { tone: "brand", label: "In Progress" };
    case "PENDING":
      return { tone: "warning", label: "Pending" };
    case "RESOLVED":
      return { tone: "success", label: "Resolved" };
    case "CLOSED":
      return { tone: "neutral", label: "Closed" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function workflowStatusTone(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "PENDING":
      return { tone: "neutral", label: "Pending" };
    case "PROCESSING":
      return { tone: "info", label: "Processing" };
    case "COMPLETED":
      return { tone: "success", label: "Completed" };
    case "FAILED":
      return { tone: "danger", label: "Failed" };
    case "RETRYING":
      return { tone: "warning", label: "Retrying" };
    case "DEAD":
      return { tone: "danger", label: "Dead Letter" };
    case "NEEDS_REVIEW":
      return { tone: "warning", label: "Needs Review" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function auditStatusTone(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "SUCCESS":
      return { tone: "success", label: "Success" };
    case "FAILED":
      return { tone: "danger", label: "Failed" };
    case "RETRYING":
      return { tone: "warning", label: "Retrying" };
    case "SKIPPED":
      return { tone: "neutral", label: "Skipped" };
    case "NEEDS_REVIEW":
      return { tone: "warning", label: "Needs Review" };
    default:
      return { tone: "neutral", label: status };
  }
}

export function channelTone(channel: string): { tone: Tone; label: string } {
  return channel === "WHATSAPP"
    ? { tone: "success", label: "WhatsApp" }
    : { tone: "brand", label: "Web Chat" };
}
