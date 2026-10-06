import { prisma } from "@/lib/db";
import type {
  CRMContactInput,
  CRMDealInput,
  CRMProvider,
  CRMResult,
} from "./provider";

let counter = 0;
function demoId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/**
 * Simulated CRM provider. Persists a clear activity trail in the database so
 * the dashboard can show what "would" have happened, while remaining honest
 * that these are NOT real HubSpot records.
 */
export class DemoCRMProvider implements CRMProvider {
  name = "demo-crm";
  isDemo = true;

  async createContact(orgId: string, input: CRMContactInput): Promise<CRMResult> {
    const customer = await prisma.customer.findFirst({
      where: { orgId, email: input.email },
    });
    if (customer) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          name: `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim() || customer.name,
          company: input.company ?? customer.company,
          companySize: input.companySize ?? customer.companySize,
          phone: input.phone ?? customer.phone,
        },
      });
      return { ok: true, id: customer.id, demo: true };
    }
    const created = await prisma.customer.create({
      data: {
        orgId,
        name: `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim() || input.email,
        email: input.email,
        company: input.company,
        companySize: input.companySize,
        phone: input.phone,
      },
    });
    return { ok: true, id: created.id, demo: true };
  }

  async updateContact(
    orgId: string,
    contactId: string,
    input: Partial<CRMContactInput>,
  ): Promise<CRMResult> {
    await prisma.customer.update({
      where: { id: contactId },
      data: {
        company: input.company,
        companySize: input.companySize,
        phone: input.phone,
      },
    });
    return { ok: true, id: contactId, demo: true };
  }

  async searchContact(orgId: string, email: string) {
    const found = await prisma.customer.findFirst({ where: { orgId, email } });
    return { ok: true, demo: true, found: !!found, id: found?.id };
  }

  async upsertContact(orgId: string, input: CRMContactInput): Promise<CRMResult> {
    // Same search-first behaviour as the live provider, recorded locally.
    return this.createContact(orgId, input);
  }

  async createDeal(_orgId: string, _input: CRMDealInput): Promise<CRMResult> {
    return { ok: true, id: demoId("deal"), demo: true };
  }

  async updateDeal(_orgId: string, dealId: string, _input: Partial<CRMDealInput>) {
    return { ok: true, id: dealId, demo: true };
  }

  async associateContactWithDeal(_orgId: string, _contactId: string, _dealId: string) {
    return { ok: true, demo: true };
  }
}
