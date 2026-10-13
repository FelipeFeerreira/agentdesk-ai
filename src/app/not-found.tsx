import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        The page you are looking for does not exist or has moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/overview"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Go to dashboard
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
