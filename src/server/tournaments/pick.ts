import { pickQuestions, type FreshCandidate, type Pick, type ReusableCandidate } from "@/server/autoquiz/pick";

export type CategoryPool = { fresh: FreshCandidate[]; reusable: ReusableCandidate[] };

/** Reparte `count` en `k` partes lo más parejas posible (las primeras llevan el resto). */
export function splitQuota(count: number, k: number): number[] {
  if (k <= 0) return [];
  const base = Math.floor(count / k);
  return Array.from({ length: k }, (_, i) => base + (i < count % k ? 1 : 0));
}

function without<T extends { id: string }>(list: T[], taken: Set<string>) {
  return list.filter((c) => !taken.has(c.id));
}

function dedupe<T extends { id: string }>(list: T[]) {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

/**
 * Preguntas de un cuestionario de torneo con varias categorías (pura):
 *   1. nuevas, repartidas en partes iguales entre las categorías;
 *   2. lo que una categoría no cubre, con nuevas de las otras;
 *   3. si todavía faltan y se permite, reutilizadas (las de uso más viejo primero).
 * Una pregunta puede estar en varias categorías: nunca se elige dos veces.
 */
export function pickAcrossCategories(
  pools: CategoryPool[],
  count: number,
  opts: { allowReuse: boolean; rng?: () => number },
): { picks: Pick[]; missing: number } {
  const taken = new Set<string>();
  const picks: Pick[] = [];
  const add = (list: Pick[]) => {
    for (const p of list) {
      if (taken.has(p.id)) continue;
      taken.add(p.id);
      picks.push(p);
    }
  };
  splitQuota(count, pools.length).forEach((quota, i) => {
    add(pickQuestions({ fresh: without(pools[i].fresh, taken), reusable: [] }, quota, null, { allowReuse: false, rng: opts.rng }).picks);
  });
  const left = count - picks.length;
  if (left > 0) {
    const merged = {
      fresh: without(dedupe(pools.flatMap((p) => p.fresh)), taken),
      reusable: without(dedupe(pools.flatMap((p) => p.reusable)), taken),
    };
    add(pickQuestions(merged, left, null, opts).picks);
  }
  return { picks, missing: count - picks.length };
}

/** Une los pools de varias categorías en uno (sin repetir preguntas que están en más de una). */
export function mergePools(pools: CategoryPool[]): CategoryPool {
  return { fresh: dedupe(pools.flatMap((p) => p.fresh)), reusable: dedupe(pools.flatMap((p) => p.reusable)) };
}
