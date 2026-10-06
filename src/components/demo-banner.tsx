import { getIntegrationModes } from "@/lib/integrations";

export async function DemoBanner() {
  const modes = await getIntegrationModes();
  const demos = modes.filter((m) => m.mode === "DEMO").map((m) => m.type);

  if (demos.length === 0) return null;

  return (
    <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <span className="font-semibold">Demo workspace</span>
      <span className="text-amber-700">
        — running in demo mode. Simulated integrations: {demos.join(", ")}. No real external
        calls are made.
      </span>
    </div>
  );
}
