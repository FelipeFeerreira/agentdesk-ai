import { prisma } from "@/lib/db";
import type { Lead } from "@prisma/client";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const COMPANY_SIZE_RE = /(\d{1,4})[\s-]*(?:employees?|people|persons?|staff|seats?|team members)/i;

export interface LeadFields {
  name?: string;
  email?: string;
  company?: string;
  companySize?: number;
  problem?: string;
  budgetRange?: string;
  timeline?: string;
}

const FIELD_ORDER: { key: keyof LeadFields; question: string }[] = [
  { key: "name", question: "Thanks for reaching out! I'd love to understand how we can help. What's your name?" },
  { key: "email", question: "What's the best email to reach you at?" },
  { key: "company", question: "What company do you work for?" },
  { key: "companySize", question: "Roughly how many employees does your team have?" },
  { key: "problem", question: "What's the main problem you're trying to solve today?" },
  { key: "budgetRange", question: "Do you have a budget range in mind for this?" },
  { key: "timeline", question: "And what's your ideal timeline to get started?" },
];

export function extractLeadFields(message: string): LeadFields {
  const fields: LeadFields = {};
  const email = message.match(EMAIL_RE);
  if (email) fields.email = email[0];

  const name = message.match(/(?:my name is|i am|i'm|im|this is)\s+([A-Za-z][A-Za-z.\- ]{1,40})/i);
  if (name) fields.name = name[1].trim();

  const size = message.match(COMPANY_SIZE_RE);
  if (size) fields.companySize = Number.parseInt(size[1], 10);

  const company = message.match(/(?:at|for|with|my company is|called|company is)\s+([A-Z][A-Za-z0-9 &-]{1,40})/);
  if (company) fields.company = company[1].trim();

  const budget = message.match(/\$\s?\d[\d,.]*(?:\s?k|\s?[km])?/i);
  if (budget) fields.budgetRange = budget[0].trim();

  if (/(asap|immediately|this (week|month)|next (week|month)|within)/i.test(message)) {
    const t = message.match(/(asap|immediately|this (week|month)|next (week|month)|within [a-z ]+)/i);
    if (t) fields.timeline = t[0];
  }

  const problem = message.match(/(?:need|want|looking for|struggling with|problem|issue|spend too much)\s+(.+)/i);
  if (problem) fields.problem = problem[1].replace(/[.!?]+$/, "").trim();

  return fields;
}

/**
 * When a customer gives a bare answer (e.g. just "Northwind Labs" in reply to
 * "What company do you work for?"), assign it to the field currently being
 * asked for, unless that field has already been populated by extraction.
 */
export function applyRawAnswer(
  message: string,
  fields: LeadFields,
  nextKey: keyof LeadFields | undefined,
): void {
  if (!nextKey || fields[nextKey] !== undefined) return;
  const cleaned = message.replace(/[.!?]+$/, "").trim();
  if (!cleaned || cleaned.length > 200) return;

  switch (nextKey) {
    case "companySize": {
      const n = cleaned.match(/(\d{1,4})/);
      if (n) fields.companySize = Number.parseInt(n[1], 10);
      break;
    }
    case "email":
    case "budgetRange":
      // These require a specific format; rely on extraction only.
      break;
    default:
      fields[nextKey] = cleaned;
  }
}

function getFieldValue(lead: Lead | null, key: keyof LeadFields): string | number | undefined {
  if (!lead) return undefined;
  const v = lead[key as keyof Lead] as string | number | null;
  return v ?? undefined;
}

export function missingFields(lead: Lead | null): (keyof LeadFields)[] {
  const required: (keyof LeadFields)[] = [
    "name",
    "email",
    "company",
    "companySize",
    "problem",
    "budgetRange",
    "timeline",
  ];
  return required.filter((key) => {
    const v = getFieldValue(lead, key);
    return v === undefined || v === null || v === "";
  });
}

export async function getLeadForConversation(
  conversationId: string,
): Promise<Lead | null> {
  return prisma.lead.findUnique({ where: { conversationId } });
}

export async function ensureLead(
  orgId: string,
  customerId: string,
  conversationId: string,
  fields: LeadFields,
): Promise<Lead> {
  const existing = await getLeadForConversation(conversationId);
  const data = {
    name: fields.name,
    email: fields.email,
    company: fields.company,
    companySize: fields.companySize,
    problem: fields.problem,
    budgetRange: fields.budgetRange,
    timeline: fields.timeline,
  };
  if (existing) {
    return prisma.lead.update({
      where: { id: existing.id },
      data: {
        name: data.name ?? existing.name,
        email: data.email ?? existing.email,
        company: data.company ?? existing.company,
        companySize: data.companySize ?? existing.companySize,
        problem: data.problem ?? existing.problem,
        budgetRange: data.budgetRange ?? existing.budgetRange,
        timeline: data.timeline ?? existing.timeline,
      },
    });
  }
  return prisma.lead.create({
    data: {
      orgId,
      customerId,
      conversationId,
      status: "NEW",
      ...data,
    },
  });
}

export function nextQuestion(lead: Lead | null): string | null {
  const missing = missingFields(lead);
  if (missing.length === 0) return null;
  const key = missing[0];
  return FIELD_ORDER.find((f) => f.key === key)?.question ?? null;
}
