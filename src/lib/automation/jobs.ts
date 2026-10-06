import { prisma } from "@/lib/db";
import type { WorkflowRun, WorkflowType } from "@prisma/client";
import { triggerN8n } from "./n8n";

/**
 * Minimal, database-backed background job runner.
 *
 * Design goals (per project brief):
 *  - Retry with exponential backoff
 *  - Idempotency via a unique idempotencyKey (duplicate enqueues are no-ops)
 *  - Explicit state machine (PENDING -> PROCESSING -> COMPLETED / RETRYING / DEAD)
 *  - No Redis / microservices — jobs are rows in Postgres/SQLite and are
 *    processed by a `processDueJobs()` sweep. In production this is driven by a
 *    scheduled endpoint (Vercel Cron / an external scheduler); see docs.
 */

const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60_000;

export interface EnqueueInput {
  orgId: string;
  type: WorkflowType;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export async function enqueueJob(input: EnqueueInput): Promise<WorkflowRun> {
  if (input.idempotencyKey) {
    const existing = await prisma.workflowRun.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing; // duplicate event — already processed/queued
  }
  return prisma.workflowRun.create({
    data: {
      orgId: input.orgId,
      type: input.type,
      payload: JSON.stringify(input.payload),
      idempotencyKey: input.idempotencyKey,
      maxAttempts: input.maxAttempts ?? 3,
      status: "PENDING",
      nextRunAt: new Date(),
    },
  });
}

function backoffMs(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1), MAX_DELAY_MS);
}

export async function processJob(runId: string): Promise<WorkflowRun> {
  const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`WorkflowRun ${runId} not found`);
  if (run.status === "COMPLETED") return run;

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });

  try {
    const result = await executeHandler(run);

    if (result === "REVIEW") {
      return await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "NEEDS_REVIEW", result: JSON.stringify({ note: "Manual review required" }) },
      });
    }

    await prisma.auditLog.create({
      data: {
        orgId: run.orgId,
        event: `workflow.${run.type.toLowerCase()}`,
        integration: "N8N",
        status: "SUCCESS",
        retryCount: run.attempts,
        metadata: JSON.stringify({ demo: result.demo }),
      },
    });

    return await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        result: JSON.stringify(result),
        completedAt: new Date(),
        error: null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (run.attempts >= run.maxAttempts) {
      await prisma.auditLog.create({
        data: {
          orgId: run.orgId,
          event: `workflow.${run.type.toLowerCase()}.dead`,
          integration: "N8N",
          status: "FAILED",
          retryCount: run.attempts,
          metadata: JSON.stringify({ error: message }),
        },
      });
      return await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "DEAD", error: message, completedAt: new Date() },
      });
    }
    return await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "RETRYING",
        error: message,
        nextRunAt: new Date(Date.now() + backoffMs(run.attempts)),
      },
    });
  }
}

async function executeHandler(
  run: WorkflowRun,
): Promise<{ demo: boolean } | "REVIEW"> {
  const payload = (JSON.parse(run.payload) || {}) as Record<string, unknown>;
  const result = await triggerN8n(run.type, { orgId: run.orgId, ...payload });
  return { demo: result.demo };
}

export async function processDueJobs(): Promise<number> {
  const due = await prisma.workflowRun.findMany({
    where: {
      status: { in: ["PENDING", "RETRYING"] },
      nextRunAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  for (const run of due) {
    await processJob(run.id);
  }
  return due.length;
}

export async function retryDeadJob(runId: string): Promise<WorkflowRun> {
  return prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "PENDING", attempts: 0, nextRunAt: new Date(), error: null },
  });
}
