import { requireUser } from "@/lib/auth/guards";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <AppSidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav user={user} />
        <main className="min-w-0 flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
