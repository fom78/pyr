import type { Metadata } from "next";
import { Coins } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getBalance } from "@/server/credits/service";
import { EmptyState, HelpTip, PageHeader, Pager, parsePage } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CreditTxType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Créditos" };

const TYPE_LABEL: Record<CreditTxType, string> = {
  SIGNUP_BONUS: "Bienvenida",
  QUIZ_REWARD: "Cuestionario",
  PERFORMANCE_BONUS: "Desempeño",
  STREAK_BONUS: "Racha",
  TOURNAMENT_ENTRY: "Inscripción",
  TOURNAMENT_PRIZE: "Premio",
  TOURNAMENT_REFUND: "Reembolso",
  ADMIN_ADJUSTMENT: "Ajuste",
  PURCHASE: "Compra",
};

const PAGE_SIZE = 25;

export default async function CreditsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const [balance, total, txs] = await Promise.all([
    getBalance(user.id),
    prisma.creditTransaction.count({ where: { userId: user.id } }),
    prisma.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Créditos" description="La moneda del juego. Se ganan jugando y se usan para inscribirse en torneos." />
      <Card className="mb-6 bg-gradient-to-br from-warning/20 to-transparent">
        <CardContent className="flex items-center gap-4 py-5">
          <Coins className="size-10 text-warning" />
          <div>
            <p className="text-3xl font-black tabular-nums">{formatNumber(balance)}</p>
            <p className="text-sm text-muted-foreground">
              créditos disponibles <HelpTip>No tienen valor real. Mirá en “Reglas → Créditos” cómo se ganan.</HelpTip>
            </p>
          </div>
        </CardContent>
      </Card>
      <h2 className="mb-2 font-semibold">Movimientos</h2>
      {txs.length === 0 ? (
        <EmptyState title="Todavía no hay movimientos" />
      ) : (
        <ul className="divide-y rounded-lg border">
          {txs.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="grid gap-0.5">
                <span>{t.reason}</span>
                <span className="text-xs text-muted-foreground">
                  {TYPE_LABEL[t.type]} · {formatDateTime(t.createdAt, user.timezone)}
                  {t.status !== "APPROVED" && ` · ${t.status === "PENDING" ? "pendiente" : "rechazado"}`}
                </span>
              </div>
              <span
                className={cn(
                  "shrink-0 font-semibold tabular-nums",
                  t.status !== "APPROVED" ? "text-muted-foreground line-through" : t.amount > 0 ? "text-success" : "text-destructive",
                )}
              >
                {t.amount > 0 ? "+" : ""}
                {formatNumber(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} searchParams={sp} basePath="/creditos" />
    </div>
  );
}
