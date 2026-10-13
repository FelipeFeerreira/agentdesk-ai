import { DemoCRMProvider } from "./demo";
import { HubSpotProvider } from "./hubspot";
import type { CRMProvider } from "./provider";
import { isDemoMode } from "@/lib/security/mode";

let cached: CRMProvider | null = null;

/**
 * Returns the active CRM provider.
 *  - demo mode → labelled DemoCRMProvider (no external calls);
 *  - connected mode → HubSpotProvider (requires HUBSPOT_ACCESS_TOKEN);
 *  - connected mode without a token → explicit error (no silent demo fallback).
 */
export function getCRMProvider(): CRMProvider {
  if (cached) return cached;
  if (isDemoMode()) {
    cached = new DemoCRMProvider();
  } else if (process.env.HUBSPOT_ACCESS_TOKEN) {
    cached = new HubSpotProvider();
  } else {
    throw new Error(
      "Connected mode (DEMO_MODE=false) requires HUBSPOT_ACCESS_TOKEN. Set it, or run with DEMO_MODE=true.",
    );
  }
  return cached;
}

export function getCRMProviderForTest(provider?: CRMProvider): CRMProvider {
  if (provider) return provider;
  return new DemoCRMProvider();
}

export type { CRMProvider } from "./provider";
export { DemoCRMProvider } from "./demo";
export { HubSpotProvider } from "./hubspot";
