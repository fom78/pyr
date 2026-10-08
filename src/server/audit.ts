import { prisma, type Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

export type AuditInput = {
  actorId: string | null;
  action: string; // "<entidad>.<verbo>", ej. "question.approve"
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
};

const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

export async function logAudit(input: AuditInput, db: Db = prisma) {
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: json(input.before),
      after: json(input.after),
      meta: json(input.meta),
    },
  });
}
