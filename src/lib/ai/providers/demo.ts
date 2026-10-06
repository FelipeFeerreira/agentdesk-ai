import type {
  AgentStepInput,
  IntentResult,
  LLMProvider,
  StepDecision,
} from "../types";

const AMOUNT_RE = /\$\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:usd|dollars?)/i;

export function extractOrderNumber(message: string): string | undefined {
  const re = /#?\s*(?<!\d)(\d{4,6})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const before = message.slice(0, m.index);
    // A number immediately preceded by a currency symbol is a price, not an order id.
    if (!/[$€£]\s*$/.test(before)) {
      return m[1];
    }
  }
  return undefined;
}

export function extractAmountCents(message: string): number | undefined {
  const m = message.match(AMOUNT_RE);
  if (!m) return undefined;
  const raw = (m[1] ?? m[2]).replace(",", "");
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) return undefined;
  return Math.round(value * 100);
}

/**
 * Deterministic, offline LLM provider. Produces correct behaviour for the
 * seeded demo scenarios without a network or API key, and is the reference
 * implementation the evaluation suite runs against.
 */
export class DemoProvider implements LLMProvider {
  name = "demo";
  isDemo = true;

  async classifyIntent(message: string, _history?: string[]): Promise<IntentResult> {
    const m = message.toLowerCase();

    // Refund policy / returns questions (checked before refund requests).
    if (
      (/(refund|refud|refond)/.test(m) && /(policy|polisy|polici|window|period|\bdays\b|\blong\b)/.test(m)) ||
      /\breturns?\b/.test(m)
    ) {
      return { intent: "refund_policy", confidence: 0.93 };
    }
    // Any other mention of a refund is treated as a refund request.
    if (/refund|refond|refud|money back/.test(m)) {
      return { intent: "refund_request", confidence: 0.9 };
    }

    // Order status — an explicit order number, or a question about an order.
    const orderNum = extractOrderNumber(message);
    if (orderNum) {
      return { intent: "order_status", confidence: 0.96, entities: { orderNumber: orderNum } };
    }
    if (/\b(order|package|parcel|shipment|tracking)\b/.test(m) && /(where|status|when|arrive|\bdeliver|\bship\b|\btrack\b|cancel)/.test(m)) {
      return { intent: "order_status", confidence: 0.8 };
    }

    if (/(shipping|\bship\b|delivery|ship time)/.test(m)) {
      return { intent: "shipping_question", confidence: 0.85 };
    }
    if (/(pricing|price|cost|how much|\bplans?\b|\btiers?\b|\btrial\b|\bdiscounts?\b|subscription)/.test(m)) {
      return { intent: "pricing_question", confidence: 0.85 };
    }
    if (/(\bspeak to\b|\btalk to\b|\ba human\b|\ba person\b|\ban agent\b|real (person|human)|representative|operator|customer service)/.test(m)) {
      return { intent: "human_request", confidence: 0.92 };
    }
    // Lead qualification: buy signal + company size / budget / company word.
    const buySignal = /(need|looking for|want|interested|looking to|searching for)/.test(m) && /(automation|automate|ai|customer support|support|agent|chatbot|bot)/.test(m);
    const companySignal = /(\d+)\s*(employees?|people|staff|person|seats)/.test(m) || /\b(company|business|startup|team|organization|agency|store|shop)\b/.test(m);
    const budgetSignal = /budget|\$\s?\d/.test(m);
    if (buySignal && (companySignal || budgetSignal)) {
      return { intent: "lead_qualification", confidence: 0.88 };
    }
    // Generic support fallback → knowledge base.
    return { intent: "general_support", confidence: 0.55 };
  }

  async planStep(input: AgentStepInput): Promise<StepDecision> {
    return planDeterministic(input);
  }

  async generateResponse(input: AgentStepInput): Promise<string> {
    return generateDeterministicResponse(input);
  }
}

export function planDeterministic(input: AgentStepInput): StepDecision {
  const { intent, customerMessage, toolResults } = input;
  const ran = (name: string) => toolResults.some((t) => t.tool === name);
  const resultOf = (name: string) => toolResults.find((t) => t.tool === name)?.result;

  switch (intent.intent) {
    case "order_status": {
      if (!ran("get_order_status")) {
        const orderNumber = intent.entities?.orderNumber ?? extractOrderNumber(customerMessage);
        if (!orderNumber) {
          return { type: "respond", content: "Could you share the order number so I can look that up for you?" };
        }
        return { type: "tool_call", tool: "get_order_status", args: { orderNumber } };
      }
      const res = resultOf("get_order_status");
      if (!res?.ok) {
        return { type: "respond", content: "I couldn't find that order in our system. Could you double-check the order number, or share the email used at checkout?" };
      }
      return { type: "respond", content: "" };
    }

    case "refund_request": {
      if (!ran("get_order_status")) {
        const orderNumber = intent.entities?.orderNumber ?? extractOrderNumber(customerMessage);
        if (!orderNumber) {
          return { type: "respond", content: "I'd be happy to help with a refund. Could you share the order number?" };
        }
        return { type: "tool_call", tool: "get_order_status", args: { orderNumber } };
      }
      const orderRes = resultOf("get_order_status");
      if (!orderRes?.ok) {
        return { type: "respond", content: "I couldn't find that order. Could you double-check the order number?" };
      }
      const amount = extractAmountCents(customerMessage);
      if (!amount) {
        return { type: "respond", content: "I see that order. What refund amount are you requesting, and could you briefly share the reason?" };
      }
      if (!ran("refund_order")) {
        const orderNumber = (orderRes.data as { orderNumber?: string })?.orderNumber ?? intent.entities?.orderNumber ?? extractOrderNumber(customerMessage);
        return { type: "tool_call", tool: "refund_order", args: { orderNumber, amountCents: amount, reason: "Customer requested refund" } };
      }
      const refundRes = resultOf("refund_order");
      if (!refundRes?.ok && (refundRes?.data as { requiresApproval?: boolean })?.requiresApproval) {
        return {
          type: "escalate",
          reason: "Refund amount exceeds approval threshold",
          summary: `Customer requested a refund of $${(amount / 100).toFixed(2)} for order, which exceeds the configured approval threshold.`,
        };
      }
      if (!refundRes?.ok) {
        return { type: "respond", content: "I wasn't able to process that refund automatically, so I've flagged it for our team to review." };
      }
      return { type: "respond", content: "" };
    }

    case "refund_policy":
    case "shipping_question":
    case "pricing_question":
    case "general_support": {
      if (!ran("search_knowledge_base")) {
        return { type: "tool_call", tool: "search_knowledge_base", args: { query: customerMessage } };
      }
      return { type: "respond", content: "" };
    }

    case "human_request": {
      if (!ran("escalate_to_human")) {
        return {
          type: "tool_call",
          tool: "escalate_to_human",
          args: { reason: "Customer requested to speak to a human", summary: "Customer explicitly asked to speak to a human agent." },
        };
      }
      return { type: "respond", content: "I've connected your request with our team. A human agent will take over shortly." };
    }

    case "lead_qualification":
      return { type: "respond", content: "" };

    case "unsupported":
    default:
      return {
        type: "respond",
        content: "I'm not able to help with that. I can help with order status, refunds and returns, shipping questions, and product questions — or connect you with our team.",
      };
  }
}

export function generateDeterministicResponse(input: AgentStepInput): string {
  const { intent, toolResults, sources } = input;
  const resultOf = (name: string) => toolResults.find((t) => t.tool === name)?.result;

  switch (intent.intent) {
    case "order_status": {
      const res = resultOf("get_order_status");
      const d = res?.data as {
        orderNumber?: string;
        status?: string;
        totalCents?: number;
        currency?: string;
        placedAt?: string;
      };
      if (!res?.ok || !d?.status) return "I couldn't retrieve that order's status right now.";
      const total = d.totalCents != null ? `$${(d.totalCents / 100).toFixed(2)}` : "";
      return `Order ${d.orderNumber} is currently ${formatOrderStatus(d.status)}.${total ? ` The order total is ${total}.` : ""}`;
    }

    case "refund_request": {
      const refund = resultOf("refund_order");
      if (refund?.ok) {
        const d = refund.data as { orderNumber?: string; refundedCents?: number };
        return `I've processed the refund of $${((d.refundedCents ?? 0) / 100).toFixed(2)} for order ${d.orderNumber}. It will appear on your original payment method within 5–7 business days.`;
      }
      const orderRes = resultOf("get_order_status");
      const d = orderRes?.data as { orderNumber?: string };
      return `Thanks — I've noted your refund request for order ${d?.orderNumber ?? ""}. Our team will review it and get back to you shortly.`;
    }

    case "refund_policy":
    case "shipping_question":
    case "pricing_question":
    case "general_support": {
      if (sources.length > 0) {
        const top = sources[0];
        return `${top.content}\n\n— From our ${top.documentTitle}`;
      }
      return "I couldn't find a confident answer to that in our knowledge base. I've noted it for our team to follow up.";
    }

    default:
      return "Thanks for your message. Is there anything else I can help with?";
  }
}

function formatOrderStatus(status: string): string {
  switch (status.toUpperCase()) {
    case "PROCESSING":
      return "being prepared for shipment";
    case "SHIPPED":
      return "on its way and has been shipped";
    case "DELIVERED":
      return "delivered";
    case "REFUNDED":
      return "refunded";
    case "CANCELLED":
      return "cancelled";
    default:
      return status.toLowerCase();
  }
}
