import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) redirect("/overview");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
              <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-ink-900">AgentDesk AI</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in to your workspace</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-ink-400">
          Demo credentials: admin@agentdesk.ai / admin123
        </p>
      </div>
    </main>
  );
}
