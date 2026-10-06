import type { Intent } from "@/lib/ai/types";

export interface EvalCase {
  name: string;
  category: string;
  input: string;
  expectedIntent: Intent;
  expectedTool?: string;
  expectedEscalate?: boolean;
}

/**
 * Predefined evaluation scenarios. These exercise intent classification,
 * tool selection and escalation behaviour against the deterministic reference
 * provider — so the suite is reproducible with no external dependencies.
 */
export const evalCases: EvalCase[] = [
  // --- Order status ---------------------------------------------------------
  { name: "order_status.basic", category: "order_status", input: "Where is order #4582?", expectedIntent: "order_status", expectedTool: "get_order_status" },
  { name: "order_status.tracking", category: "order_status", input: "Can you track my order 4582?", expectedIntent: "order_status", expectedTool: "get_order_status" },
  { name: "order_status.no_number", category: "order_status", input: "Where is my order?", expectedIntent: "order_status" },
  { name: "order_status.when_arrive", category: "order_status", input: "When will order #4610 arrive?", expectedIntent: "order_status", expectedTool: "get_order_status" },
  { name: "order_status.shipment", category: "order_status", input: "Status of shipment #4701 please", expectedIntent: "order_status", expectedTool: "get_order_status" },

  // --- Refund policy --------------------------------------------------------
  { name: "refund_policy.basic", category: "refund_policy", input: "What is your refund policy?", expectedIntent: "refund_policy", expectedTool: "search_knowledge_base" },
  { name: "refund_policy.return", category: "refund_policy", input: "How do returns work?", expectedIntent: "refund_policy", expectedTool: "search_knowledge_base" },
  { name: "refund_policy.window", category: "refund_policy", input: "How many days do I have to return a product?", expectedIntent: "refund_policy", expectedTool: "search_knowledge_base" },

  // --- Refund request -------------------------------------------------------
  { name: "refund_request.amount", category: "refund_request", input: "I need a $500 refund for order #4701.", expectedIntent: "refund_request", expectedTool: "get_order_status" },
  { name: "refund_request.small", category: "refund_request", input: "I want a refund for order #4530, it was $49.", expectedIntent: "refund_request", expectedTool: "get_order_status" },
  { name: "refund_request.no_number", category: "refund_request", input: "I want a refund.", expectedIntent: "refund_request" },
  { name: "refund_request.reason", category: "refund_request", input: "Please refund my last order, it arrived damaged.", expectedIntent: "refund_request" },

  // --- Shipping -------------------------------------------------------------
  { name: "shipping.how_long", category: "shipping_question", input: "How long does shipping take?", expectedIntent: "shipping_question", expectedTool: "search_knowledge_base" },
  { name: "shipping.delivery", category: "shipping_question", input: "When will my delivery arrive?", expectedIntent: "shipping_question", expectedTool: "search_knowledge_base" },
  { name: "shipping.expedited", category: "shipping_question", input: "Do you offer expedited shipping?", expectedIntent: "shipping_question", expectedTool: "search_knowledge_base" },

  // --- Pricing --------------------------------------------------------------
  { name: "pricing.cost", category: "pricing_question", input: "How much does it cost?", expectedIntent: "pricing_question", expectedTool: "search_knowledge_base" },
  { name: "pricing.plans", category: "pricing_question", input: "What plans do you offer?", expectedIntent: "pricing_question", expectedTool: "search_knowledge_base" },
  { name: "pricing.starter", category: "pricing_question", input: "What's included in the starter plan?", expectedIntent: "pricing_question", expectedTool: "search_knowledge_base" },
  { name: "pricing.subscription", category: "pricing_question", input: "Is this a subscription?", expectedIntent: "pricing_question", expectedTool: "search_knowledge_base" },

  // --- Lead qualification ---------------------------------------------------
  { name: "lead.size_and_need", category: "lead_qualification", input: "I have a company with 30 employees and need automation for customer support.", expectedIntent: "lead_qualification" },
  { name: "lead.25_person", category: "lead_qualification", input: "I run a 25-person company and want AI customer support.", expectedIntent: "lead_qualification" },
  { name: "lead.want_ai_agent", category: "lead_qualification", input: "We are a 60 person team looking for an AI agent for support.", expectedIntent: "lead_qualification" },
  { name: "lead.need_chatbot", category: "lead_qualification", input: "Our startup needs a chatbot for 8 employees.", expectedIntent: "lead_qualification" },
  { name: "lead.budget", category: "lead_qualification", input: "I need customer support automation and have a $2000 budget.", expectedIntent: "lead_qualification" },

  // --- Human request --------------------------------------------------------
  { name: "human.speak", category: "human_request", input: "I want to speak to a human.", expectedIntent: "human_request", expectedTool: "escalate_to_human" },
  { name: "human.person", category: "human_request", input: "Can I talk to a real person?", expectedIntent: "human_request", expectedTool: "escalate_to_human" },
  { name: "human.agent", category: "human_request", input: "Get me an agent please.", expectedIntent: "human_request", expectedTool: "escalate_to_human" },
  { name: "human.representative", category: "human_request", input: "I'd like to speak with a representative.", expectedIntent: "human_request", expectedTool: "escalate_to_human" },

  // --- General support ------------------------------------------------------
  { name: "general.faq", category: "general_support", input: "How do I connect my WhatsApp account?", expectedIntent: "general_support", expectedTool: "search_knowledge_base" },
  { name: "general.how_works", category: "general_support", input: "How does the AI work?", expectedIntent: "general_support", expectedTool: "search_knowledge_base" },
  { name: "general.data_security", category: "general_support", input: "How is my data secured?", expectedIntent: "general_support", expectedTool: "search_knowledge_base" },
  { name: "general.languages", category: "general_support", input: "What languages do you support?", expectedIntent: "general_support", expectedTool: "search_knowledge_base" },

  // --- Unsupported / out of scope ------------------------------------------
  { name: "unsupported.weather", category: "unsupported", input: "What's the weather in Paris?", expectedIntent: "general_support" },
  { name: "unsupported.joke", category: "unsupported", input: "Tell me a joke about the stock market.", expectedIntent: "general_support" },
  { name: "unsupported.coding", category: "unsupported", input: "Write me a Python script to scrape websites.", expectedIntent: "general_support" },

  // --- Invalid inputs -------------------------------------------------------
  { name: "invalid.empty", category: "invalid_input", input: "", expectedIntent: "general_support" },
  { name: "invalid.symbols", category: "invalid_input", input: "!!!???", expectedIntent: "general_support" },
  { name: "invalid.long_number", category: "invalid_input", input: "order #999999999999", expectedIntent: "general_support", expectedTool: "search_knowledge_base" },

  // --- Edge cases -----------------------------------------------------------
  { name: "edge.order_zero", category: "edge", input: "order #0000", expectedIntent: "order_status", expectedTool: "get_order_status" },
  { name: "edge.refund_policy_misspelled", category: "edge", input: "wat is ur refud polisy?", expectedIntent: "refund_policy", expectedTool: "search_knowledge_base" },
  { name: "edge.case_insensitive", category: "edge", input: "WHERE IS ORDER #4582", expectedIntent: "order_status", expectedTool: "get_order_status" },
  { name: "edge.human_uppercase", category: "edge", input: "I NEED A HUMAN", expectedIntent: "human_request", expectedTool: "escalate_to_human" },

  // --- Additional order status ----------------------------------------------
  { name: "order_status.delivered", category: "order_status", input: "Has order #4530 been delivered?", expectedIntent: "order_status", expectedTool: "get_order_status" },
  { name: "order_status.package", category: "order_status", input: "Where is my package?", expectedIntent: "order_status" },
  { name: "order_status.tracking_number", category: "order_status", input: "Can I get a tracking number for order 4582?", expectedIntent: "order_status", expectedTool: "get_order_status" },
  { name: "order_status.arrive_date", category: "order_status", input: "When will my shipment arrive?", expectedIntent: "order_status" },

  // --- Additional refund requests -------------------------------------------
  { name: "refund_request.large", category: "refund_request", input: "Refund $799 for order 4701 please", expectedIntent: "refund_request", expectedTool: "get_order_status" },
  { name: "refund_request.cancel", category: "refund_request", input: "I changed my mind, can I get a refund?", expectedIntent: "refund_request" },

  // --- Additional refund policy ---------------------------------------------
  { name: "refund_policy.days", category: "refund_policy", input: "How many days for a refund?", expectedIntent: "refund_policy", expectedTool: "search_knowledge_base" },
  { name: "refund_policy.returns", category: "refund_policy", input: "What's the returns process?", expectedIntent: "refund_policy", expectedTool: "search_knowledge_base" },

  // --- Additional shipping --------------------------------------------------
  { name: "shipping.international", category: "shipping_question", input: "Do you ship internationally?", expectedIntent: "shipping_question", expectedTool: "search_knowledge_base" },
  { name: "shipping.cost", category: "shipping_question", input: "How much is shipping?", expectedIntent: "shipping_question", expectedTool: "search_knowledge_base" },

  // --- Additional pricing ---------------------------------------------------
  { name: "pricing.trial", category: "pricing_question", input: "Do you offer a free trial?", expectedIntent: "pricing_question", expectedTool: "search_knowledge_base" },
  { name: "pricing.annual", category: "pricing_question", input: "What's the annual pricing discount?", expectedIntent: "pricing_question", expectedTool: "search_knowledge_base" },
  { name: "pricing.scale", category: "pricing_question", input: "Tell me about the scale plan tier.", expectedIntent: "pricing_question", expectedTool: "search_knowledge_base" },

  // --- Additional lead qualification ----------------------------------------
  { name: "lead.company_need", category: "lead_qualification", input: "Our company needs an AI support solution.", expectedIntent: "lead_qualification" },
  { name: "lead.team_size", category: "lead_qualification", input: "We have a team of 40 and want to automate support.", expectedIntent: "lead_qualification" },
  { name: "lead.budget_company", category: "lead_qualification", input: "We have a budget of $500/month and 15 employees looking for a chatbot.", expectedIntent: "lead_qualification" },

  // --- Additional human requests --------------------------------------------
  { name: "human.operator", category: "human_request", input: "Can I talk to an operator?", expectedIntent: "human_request", expectedTool: "escalate_to_human" },
  { name: "human.customer_service", category: "human_request", input: "I need customer service.", expectedIntent: "human_request", expectedTool: "escalate_to_human" },
  { name: "human.real_person", category: "human_request", input: "Is there a real person I can talk to?", expectedIntent: "human_request", expectedTool: "escalate_to_human" },

  // --- Additional general support -------------------------------------------
  { name: "general.setup", category: "general_support", input: "How do I get started with the platform?", expectedIntent: "general_support", expectedTool: "search_knowledge_base" },
  { name: "general.handoff", category: "general_support", input: "Does the AI escalate conversations to my team?", expectedIntent: "general_support", expectedTool: "search_knowledge_base" },
  { name: "general.connect_channel", category: "general_support", input: "How do I connect a channel?", expectedIntent: "general_support", expectedTool: "search_knowledge_base" },

  // --- Additional invalid / edge --------------------------------------------
  { name: "invalid.only_number", category: "invalid_input", input: "123456", expectedIntent: "order_status", expectedTool: "get_order_status" },
  { name: "invalid.gibberish", category: "invalid_input", input: "asdfghjkl qwerty zxcvbn", expectedIntent: "general_support", expectedTool: "search_knowledge_base" },
  { name: "edge.lead_not_support", category: "edge", input: "I need 30 employees for my company", expectedIntent: "general_support", expectedTool: "search_knowledge_base" },
];
