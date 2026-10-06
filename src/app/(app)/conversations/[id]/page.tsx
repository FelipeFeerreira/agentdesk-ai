import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getConversationDetail } from "@/lib/queries/conversations";
import { Badge, channelTone, conversationStatusTone } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";
import { ConversationActions } from "./conversation-actions";
import { DecisionButtons } from "./decision-buttons";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const conversation = await getConversationDetail(user.orgId, id);
  if (!conversation) notFound();

  const st = conversationStatusTone(conversation.status);
  const ch = channelTone(conversation.channel);
  const escalation = conversation.escalations[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/conversations"
              className="text-sm text-ink-400 hover:text-ink-700"
            >
              ← Conversations
            </Link>
          </div>
          <h1 className="mt-1 text-lg font-semibold text-ink-900">
            {conversation.customer.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <Badge tone={ch.tone}>{ch.label}</Badge>
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
            {conversation.intent && (
              <span className="capitalize">Intent: {conversation.intent.replace(/_/g, " ")}</span>
            )}
            {conversation.aiConfidence != null && (
              <span>· {Math.round(conversation.aiConfidence * 100)}% confidence</span>
            )}
          </div>
        </div>
        <ConversationActions
          conversationId={conversation.id}
          status={conversation.status}
          customerEmail={conversation.customer.email ?? ""}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {conversation.messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {escalation && (
            <Card>
              <CardHeader>
                <CardTitle>Escalation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium text-ink-900">{escalation.reason}</p>
                <p className="text-ink-600">{escalation.aiSummary}</p>
                <p className="text-xs text-ink-400">
                  Status: {escalation.status.toLowerCase()} · {formatRelative(escalation.createdAt)}
                </p>
                <EscalationDecision escalationId={escalation.id} status={escalation.status} />
              </CardContent>
            </Card>
          )}

          {conversation.toolCalls.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tool calls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {conversation.toolCalls.map((t) => (
                  <div key={t.id} className="rounded-lg border border-ink-100 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium text-ink-900">{t.name}</span>
                      <Badge tone={t.status === "SUCCESS" ? "success" : "danger"}>
                        {t.status.toLowerCase()}
                      </Badge>
                    </div>
                    <details className="mt-2 text-xs text-ink-500">
                      <summary className="cursor-pointer">Arguments & result</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-ink-50 p-2 font-mono text-[11px]">
                        {JSON.stringify(
                          { args: JSON.parse(t.arguments), result: t.result ? JSON.parse(t.result) : null },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {conversation.customer && (
            <Card>
              <CardHeader>
                <CardTitle>Customer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-ink-600">
                <p>{conversation.customer.email}</p>
                <p>{conversation.customer.company}</p>
                {conversation.customer.companySize && (
                  <p>{conversation.customer.companySize} employees</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
}: {
  message: { id: string; role: string; content: string; createdAt: Date };
}) {
  const isCustomer = message.role === "CUSTOMER";
  const isSystem = message.role === "SYSTEM";
  const isHuman = message.role === "HUMAN";
  if (isSystem) {
    return (
      <div className="text-center text-xs text-ink-400">{message.content}</div>
    );
  }
  const label = isCustomer ? "Customer" : isHuman ? "Human agent" : "AI Agent";
  return (
    <div className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%]">
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm ${
            isCustomer
              ? "bg-brand-600 text-white"
              : isHuman
                ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                : "bg-ink-100 text-ink-900"
          }`}
        >
          {message.content}
        </div>
        <div className={`mt-1 text-[11px] text-ink-400 ${isCustomer ? "text-right" : ""}`}>
          {label} · {formatRelative(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

function EscalationDecision({
  escalationId,
  status,
}: {
  escalationId: string;
  status: string;
}) {
  return <DecisionButtons escalationId={escalationId} status={status} />;
}
