import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getCurrent } from "@/server/game/engine";
import { prisma } from "@/server/db";
import { GamePlayer } from "./game-player";

export const metadata: Metadata = { title: "Jugando" };

export default async function PlayPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser();
  const { attemptId } = await params;
  const state = await getCurrent(attemptId, user.id);
  if (state.status === "FINISHED") redirect(`/resultados/${attemptId}`);
  const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { quiz: { select: { title: true } }, wildcardUse: true } });
  return <GamePlayer initial={state} title={attempt.quiz.title} wildcard={attempt.wildcardUse?.type ?? null} />;
}
