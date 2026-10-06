/**
 * CRM abstraction. Business logic depends on the `CRMProvider` interface,
 * never on HubSpot directly. The demo provider records activity locally so the
 * whole application remains demonstrable without credentials.
 */

export interface CRMContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  companySize?: number;
}

export interface CRMDealInput {
  name: string;
  amount?: number;
  stage?: string;
  contactId?: string;
}

export interface CRMResult {
  ok: boolean;
  id?: string;
  /** true when the operation happened against a simulated provider. */
  demo?: boolean;
  error?: string;
}

export interface CRMProvider {
  name: string;
  isDemo: boolean;
  createContact(orgId: string, input: CRMContactInput): Promise<CRMResult>;
  updateContact(orgId: string, contactId: string, input: Partial<CRMContactInput>): Promise<CRMResult>;
  searchContact(orgId: string, email: string): Promise<CRMResult & { found?: boolean }>;
  createDeal(orgId: string, input: CRMDealInput): Promise<CRMResult>;
  updateDeal(orgId: string, dealId: string, input: Partial<CRMDealInput>): Promise<CRMResult>;
  associateContactWithDeal(orgId: string, contactId: string, dealId: string): Promise<CRMResult>;
}
