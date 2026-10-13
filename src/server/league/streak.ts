/**
 * Racha en una categoría con cuestionarios de ventanas solapadas (pura).
 *
 * Se recorren los cuestionarios de liga por `closesAt`, del más nuevo al más viejo:
 * - jugado → suma;
 * - sin jugar pero todavía abierto (o por abrir) → pendiente: ni suma ni corta;
 * - sin jugar y ya cerrado → corta la racha.
 * Así el orden en que se juegan los abiertos no importa. Los que cerraron antes de que el usuario
 * entrara a la categoría (`since`) no cuentan: nunca son "salteados".
 */
export function computeStreak(
  quizzes: { id: string; closesAt: Date }[],
  played: ReadonlySet<string>,
  now: Date,
  since: Date | null = null,
) {
  const list = quizzes
    .filter((q) => !since || q.closesAt > since)
    .sort((a, b) => b.closesAt.getTime() - a.closesAt.getTime() || (a.id < b.id ? 1 : -1));
  let current = 0;
  for (const q of list) {
    if (played.has(q.id)) current++;
    else if (q.closesAt <= now) break;
  }
  return current;
}
