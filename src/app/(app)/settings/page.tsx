import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsForm } from "./settings-form";

const INTEGRATION_INFO: Record<string, { label: string; description: string; env: string }> = {
  OPENAI: { label: "OpenAI", description: "LLM for intent, tool selection and responses.", env: "OPENAI_API_KEY" },
  HUBSPOT: { label: "HubSpot", description: "CRM contact & deal sync.", env: "HUBSPOT_ACCESS_TOKEN" },
  WHATSAPP: { label: "WhatsApp", description: "WhatsApp Cloud API messaging.", env: "WHATSAPP_TOKEN" },
  N8N: { label: "n8n", description: "Business workflow automation webhooks.", env: "N8N_WEBHOOK_URL" },
  GOOGLE_DRIVE: { label: "Google Drive", description: "Document source for knowledge ingestion.", env: "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON" },
};

export default async function SettingsPage() {
  const user = await requireUser();
  const [org, integrations] = await Promise.all([
    prisma.organization.findUnique({ where: { id: user.orgId } }),
    prisma.integration.findMany({ where: { orgId: user.orgId } }),
  ]);
  const settings = parseSettings(org?.settings ?? "{}");

  return (
    <>
      <PageHeader title="Settings" description="Configure your AI agent, business rules and integrations." />

      <div className="space-y-6">
        <SettingsForm settings={settings} />

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrations.map((i) => {
              const info = INTEGRATION_INFO[i.type];
              return (
                <div key={i.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">{info?.label ?? i.type}</span>
                      <Badge tone={i.mode === "DEMO" ? "warning" : "success"}>
                        {i.mode === "DEMO" ? "Demo" : "Live"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">{info?.description}</p>
                    {i.mode === "LIVE" && (
                      <p className="mt-0.5 font-mono text-[11px] text-ink-400">
                        configured via {info?.env}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-ink-400">
              Demo integrations are clearly labelled and never make real external calls. Set the
              corresponding environment variable and restart to switch to live mode.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
