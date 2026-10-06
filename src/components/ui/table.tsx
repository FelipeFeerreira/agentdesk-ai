import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Table({
  headers,
  children,
  className,
}: {
  headers: ReactNode[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 first:pl-5 last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Row({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "text-ink-700",
        onClick && "cursor-pointer transition-colors hover:bg-ink-50",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Cell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-4 py-3 first:pl-5 last:pr-5 align-middle", className)}>{children}</td>
  );
}
