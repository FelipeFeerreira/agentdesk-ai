"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Sparkles } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";
import { SignOutButton } from "./sign-out-button";

export function MobileNav({ user }: { user: { name: string; email: string; role: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Lock scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-200 bg-white/90 px-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-ink-900">AgentDesk</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-ink-900/40"
            onClick={() => setOpen(false)}
          />
          <nav className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col border-r border-ink-200 bg-white shadow-[var(--shadow-pop)]">
            <div className="flex h-14 items-center justify-between border-b border-ink-100 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-ink-900">AgentDesk</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 thin-scroll">
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:bg-ink-50 hover:text-ink-900",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="border-t border-ink-100 p-3">
              <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-700">
                  {initials(user.name)}
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[13px] font-medium text-ink-900">{user.name}</div>
                  <div className="truncate text-[11px] text-ink-400">{user.email}</div>
                </div>
              </div>
              <SignOutButton className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-ink-500 hover:bg-ink-50 hover:text-ink-700">
                Sign out
              </SignOutButton>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
