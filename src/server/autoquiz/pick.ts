/** Mezcla de dificultad: cantidad de preguntas por dificultad ("1".."5"). */
export type DifficultyMix = Record<string, number>;

export type FreshCandidate = { id: string; difficulty: number; createdAt: Date };
export type ReusableCandidate = { id: string; difficulty: number; lastUsedAt: Date };

export type Pick = { id: string; reused: boolean };

/** Toma `n` de una lista ya ordenada por prioridad, con algo de azar entre las primeras. */
function takeFrom<T extends { id: string }>(list: T[], n: number, taken: Set<string>, rng: () => number): T[] {
  if (n <= 0) return [];
  const window = list.filter((c) => !taken.has(c.id)).slice(0, n * 2);
  for (let i = window.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [window[i], window[j]] = [window[j], window[i]];
  }
  const out = window.slice(0, n);
  for (const c of out) taken.add(c.id);
  return out;
}

export function mixTotal(mix: DifficultyMix | null | undefined) {
  return Object.values(mix ?? {}).reduce((a, n) => a + (n > 0 ? n : 0), 0);
}

/**
 * Elige las preguntas de un borrador, siempre las nunca usadas antes que las reutilizadas:
 *   1. nunca usadas respetando la mezcla de dificultad;
 *   2. nunca usadas de cualquier dificultad;
 *   3. si se permite y aún falta: reutilizadas de la dificultad que faltó en la mezcla y después de cualquiera.
 * Las nunca usadas se priorizan por antigüedad en el banco; las reutilizadas, por uso más viejo.
 */
export function pickQuestions(
  pools: { fresh: FreshCandidate[]; reusable: ReusableCandidate[] },
  count: number,
  mix: DifficultyMix | null | undefined,
  opts: { allowReuse: boolean; rng?: () => number },
): { picks: Pick[]; missing: number } {
  const rng = opts.rng ?? Math.random;
  const fresh = [...pools.fresh].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const reusable = opts.allowReuse ? [...pools.reusable].sort((a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime()) : [];
  const taken = new Set<string>();
  const picks: Pick[] = [];
  const add = (list: { id: string }[], reused: boolean) => list.forEach((c) => picks.push({ id: c.id, reused }));

  const pendingMix = new Map<number, number>();
  let budget = count;
  for (const [d, raw] of Object.entries(mix ?? {})) {
    const want = Math.min(Math.max(0, Math.floor(raw)), budget);
    if (!want) continue;
    const got = takeFrom(
      fresh.filter((c) => c.difficulty === Number(d)),
      want,
      taken,
      rng,
    );
    add(got, false);
    budget -= got.length;
    if (got.length < want) pendingMix.set(Number(d), want - got.length);
  }
  add(takeFrom(fresh, count - picks.length, taken, rng), false);
  for (const [d, n] of pendingMix)
    add(
      takeFrom(
        reusable.filter((c) => c.difficulty === d),
        Math.min(n, count - picks.length),
        taken,
        rng,
      ),
      true,
    );
  add(takeFrom(reusable, count - picks.length, taken, rng), true);

  return { picks, missing: count - picks.length };
}

/** Lo que falta de la mezcla dada las dificultades que ya tiene un borrador (para completarlo sin tocar lo que hay). */
export function remainingMix(mix: DifficultyMix | null | undefined, existing: number[]): DifficultyMix | null {
  if (!mix) return null;
  const out: DifficultyMix = {};
  for (const [d, n] of Object.entries(mix)) {
    const left = n - existing.filter((x) => String(x) === d).length;
    if (left > 0) out[d] = left;
  }
  return out;
}
