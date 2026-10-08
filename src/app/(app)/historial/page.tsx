import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { EmptyState, PageHeader, Pager, parsePage } from "@/components/common";
import { formatDateTime, formatMs, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Mis intentos" };

const PAGE_SIZE = 20;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const [total, attempts] = await Promise.all([
    prisma.attempt.count({ where: { userId: user.id } }),
    prisma.attempt.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { quiz: { include: { category: true, tournament: true } }, wildcardUse: true },
    }),
  ]);
  return (
    <>
      <PageHeader title="Mis intentos" description={`${total} cuestionarios jugados`} />
      {attempts.length === 0 ? (
        <EmptyState title="Todavía no jugaste ningún cuestionario" />
      ) : (
        <ul className="grid gap-2">
          {attempts.map((a) => (
            <li key={a.id}>
              <Link
                href={a.status === "IN_PROGRESS" ? `/jugar/${a.id}` : `/resultados/${a.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 hover:bg-accent/50"
              >
                <div className="grid gap-0.5">
                  <span className="font-medium">{a.quiz.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.quiz.tournament ? `🏆 ${a.quiz.tournament.name}` : `${a.quiz.category?.icon} ${a.quiz.category?.name}`} ·{" "}
                    {formatDateTime(a.startedAt, user.timezone)}
                    {a.wildcardUse && " · 🃏 comodín"}
                  </span>
                </div>
                <span className="text-right text-sm tabular-nums">
                  {a.status === "IN_PROGRESS" ? (
                    <span className="font-medium text-warning-foreground dark:text-warning">En curso</span>
                  ) : (
                    <>
                      <strong>{formatNumber(a.score)} pts</strong>
                      <span className="block text-xs text-muted-foreground">
                        {a.correctCount} aciertos · {formatMs(a.totalTimeMs)}
                      </span>
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} searchParams={sp} basePath="/historial" />
    </>
  );
}
