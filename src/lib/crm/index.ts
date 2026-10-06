import { DemoCRMProvider } from "./demo";
import { HubSpotProvider } from "./hubspot";
import type { CRMProvider } from "./provider";

let cached: CRMProvider | null = null;

/**
 * Returns the active CRM provider. Uses HubSpot only when DEMO_MODE is off and
 * credentials are present; otherwise the clearly-labelled demo provider.
 * Respecting DEMO_MODE here guarantees demo mode never makes live CRM calls.
 */
export function getCRMProvider(): CRMProvider {
  if (cached) return cached;
  const demoMode = (process.env.DEMO_MODE ?? "true") !== "false";
  cached = !demoMode && process.env.HUBSPOT_ACCESS_TOKEN
    ? new HubSpotProvider()
    : new DemoCRMProvider();
  return cached;
}

export function getCRMProviderForTest(provider?: CRMProvider): CRMProvider {
  if (provider) return provider;
  return new DemoCRMProvider();
}

export type { CRMProvider } from "./provider";
export { DemoCRMProvider } from "./demo";
export { HubSpotProvider } from "./hubspot";
