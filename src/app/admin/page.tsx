import Link from "next/link";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata = { title: "Dashboard" };

const DAY = 86_400_000;

function Stat({ label, value, href, hint }: { label: string; value: number | string; href?: string; hint?: string }) {
  const body = (
    <Card className="h-full transition-colors hover:border-primary/50">
      <CardContent className="py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tabular-nums">{typeof value === "number" ? formatNumber(value) : value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const [users, newUsers, activePlayers, pending, activeQuizzes, attemptsWeek, openTournaments, credits, recentQuizzes] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.attempt.groupBy({ by: ["userId"], where: { startedAt: { gte: weekAgo } } }).then((r) => r.length),
    prisma.question.count({ where: { status: "PENDING_REVIEW", archived: false } }),
    prisma.quiz.count({ where: { publishedAt: { not: null }, opensAt: { lte: now }, closesAt: { gt: now } } }),
    prisma.attempt.count({ where: { startedAt: { gte: weekAgo } } }),
    prisma.tournament.count({ where: { status: "PUBLISHED", endsAt: { gt: now } } }),
    prisma.creditTransaction.aggregate({ where: { status: "APPROVED" }, _sum: { amount: true } }),
    prisma.quiz.findMany({
      where: { publishedAt: { not: null }, opensAt: { lte: now } },
      orderBy: { opensAt: "desc" },
      take: 10,
      include: {
        category: { select: { name: true, icon: true } },
        tournament: { select: { name: true } },
        _count: { select: { attempts: true } },
      },
    }),
  ]);
  const maxAttempts = Math.max(1, ...recentQuizzes.map((q) => q._count.attempts));

  return (
    <>
      <PageHeader title="Dashboard" description={`Hola, ${user.name}. Resumen de los últimos 7 días.`} />
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Usuarios" value={users} hint={`+${newUsers} esta semana`} href="/admin/usuarios" />
        <Stat label="Jugadores activos (7 días)" value={activePlayers} />
        <Stat label="Intentos (7 días)" value={attemptsWeek} />
        <Stat label="Preguntas por revisar" value={pending} href="/admin/preguntas?status=PENDING_REVIEW" />
        <Stat label="Cuestionarios vigentes" value={activeQuizzes} href="/admin/cuestionarios?status=ACTIVE" />
        <Stat label="Torneos en curso" value={openTournaments} href="/admin/torneos" />
        <Stat label="Créditos en circulación" value={credits._sum.amount ?? 0} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Intentos por cuestionario (últimos 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {recentQuizzes.map((q) => (
              <li key={q.id} className="grid gap-1 text-sm">
                <div className="flex justify-between gap-2">
                  <Link href={`/admin/cuestionarios/${q.id}`} className="truncate hover:underline">
                    {q.tournament ? `🏆 ${q.tournament.name}` : q.category?.icon} {q.title}
                  </Link>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {q._count.attempts} · {formatDate(q.opensAt, user.timezone)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(q._count.attempts / maxAttempts) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
