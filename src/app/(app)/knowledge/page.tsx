import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Cell, Row, Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { KnowledgeUpload } from "./knowledge-upload";
import { DocumentRowActions } from "./document-actions";

const docStatusTone = (s: string) =>
  s === "READY" ? "success" : s === "FAILED" ? "danger" : s === "PROCESSING" ? "info" : "neutral";

export default async function KnowledgePage() {
  const user = await requireUser();
  const documents = await prisma.knowledgeDocument.findMany({
    where: { orgId: user.orgId },
    include: { chunks: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description="Documents that power your AI agent's answers via RAG."
      />
      <div className="mb-6">
        <KnowledgeUpload />
      </div>

      <Card className="overflow-hidden">
        <Table headers={["Document", "Type", "Chunks", "Status", "Created", "Actions"]}>
          {documents.map((d) => {
            const tone = docStatusTone(d.status) as "success" | "danger" | "info" | "neutral";
            return (
              <Row key={d.id}>
                <Cell>
                  <div className="font-medium text-ink-900">{d.title}</div>
                  <div className="text-xs text-ink-400">{d.source}</div>
                </Cell>
                <Cell className="text-ink-600">{d.type}</Cell>
                <Cell className="text-ink-600">{d.chunks.length}</Cell>
                <Cell>
                  <Badge tone={tone}>{d.status.toLowerCase()}</Badge>
                  {d.error && <div className="mt-1 max-w-[200px] truncate text-xs text-red-600">{d.error}</div>}
                </Cell>
                <Cell className="text-ink-500">{formatDate(d.createdAt)}</Cell>
                <Cell>
                  <DocumentRowActions documentId={d.id} />
                </Cell>
              </Row>
            );
          })}
        </Table>
        {documents.length === 0 && (
          <p className="px-5 py-12 text-center text-sm text-ink-400">No documents indexed yet.</p>
        )}
      </Card>
    </>
  );
}
