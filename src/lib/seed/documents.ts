/**
 * Original, non-copyrighted demo knowledge-base documents for AgentDesk AI.
 * These are used to seed the RAG pipeline so the demo is fully self-contained.
 */

export interface SeedDocument {
  title: string;
  type: "MANUAL" | "TEXT" | "MARKDOWN";
  source: string;
  content: string;
}

export const seedDocuments: SeedDocument[] = [
  {
    title: "Refund Policy",
    type: "MANUAL",
    source: "manual",
    content: `Refund Policy

AgentDesk offers refunds on subscription plans within 30 days of purchase, provided the account has not been used to send more than 100 customer messages.

To request a refund, contact support and provide your order number. Refunds are issued to the original payment method and typically appear within 5 to 7 business days.

Refund amounts above $100 require manual approval by our team and may take up to 3 business days to process.

Digital onboarding and setup fees are non-refundable once services have begun.

If a refund is approved, access to the platform is revoked immediately and all associated data is deleted after 30 days.`,
  },
  {
    title: "Shipping Policy",
    type: "MANUAL",
    source: "manual",
    content: `Shipping Policy

AgentDesk is a software-as-a-service platform, so most plans are delivered digitally and activated immediately after payment.

For customers who purchase onboarding hardware kits or printed materials, orders are shipped within 2 business days of payment confirmation.

Standard shipping takes 3 to 5 business days. Expedited shipping is available at checkout and takes 1 to 2 business days.

Once an order ships, a tracking number is sent to the email on file. Delivery delays caused by the carrier are outside our control, but our support team can open a trace with the carrier on your behalf.`,
  },
  {
    title: "Pricing Guide",
    type: "MANUAL",
    source: "manual",
    content: `Pricing Guide

AgentDesk pricing starts at $49 per month for the Starter plan, which includes 500 AI conversations and one connected channel.

The Growth plan costs $199 per month and includes 5,000 conversations, WhatsApp and web chat, and CRM sync.

The Scale plan costs $799 per month and includes 50,000 conversations, custom knowledge base, and priority support.

All pricing tiers include a 14-day free trial with no credit card required. The price of each plan is fixed and has no hidden costs.

Annual billing saves 20% compared to monthly billing. Volume discounts are available for organizations processing more than 100,000 conversations per month.`,
  },
  {
    title: "FAQ",
    type: "MANUAL",
    source: "manual",
    content: `Frequently Asked Questions

How do I connect my WhatsApp business account? You can connect WhatsApp from the Integrations page in Settings using your Meta Business account credentials.

Does the AI work out of the box? Yes. After connecting a channel, the AI agent immediately handles common support questions using your knowledge base.

Can the AI hand off to a human? Yes. Customers can request a human at any time, and the AI automatically escalates sensitive or low-confidence cases to your team.

What languages are supported? AgentDesk supports over 50 languages, configurable per organization in Settings.

How is my data secured? All data is encrypted in transit and at rest, and AI providers are used under data-processing agreements.`,
  },
  {
    title: "Product Documentation",
    type: "MANUAL",
    source: "manual",
    content: `Product Documentation — Getting Started

To get started, create an organization, invite your team, and connect a channel such as web chat or WhatsApp.

Upload your support policies and FAQs to the Knowledge Base. The AI agent uses these documents to answer customer questions with citations.

Configure your escalation rules in Settings, including the refund approval threshold and the minimum confidence for automated answers.

Connect HubSpot to sync qualified leads and deals automatically. You can also configure n8n workflows for custom automations such as Slack notifications and follow-up tasks.`,
  },
  {
    title: "Support Handbook",
    type: "MANUAL",
    source: "manual",
    content: `Support Handbook

Our support team responds to escalated conversations within one business hour during business hours (9:00 to 18:00 local time).

When reviewing an escalation, always confirm the proposed action against the customer's order history and the relevant policy before approving.

Refunds above the approval threshold require a team lead to approve. Never approve a refund without verifying the order number.

For technical issues that the AI cannot resolve, create a ticket and assign it to the appropriate team. Track resolution in the Tickets view.`,
  },
];
