export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-6 w-40 rounded bg-ink-100" />
        <div className="h-4 w-64 rounded bg-ink-100" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-ink-200 bg-white" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-ink-200 bg-white" />
    </div>
  );
}
