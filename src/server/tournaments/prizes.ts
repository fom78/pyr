/** Premios de torneo por puesto (columna JSON `Tournament.prizes`) — funciones puras. */
export type TournamentPrize = { rank: number; credits: number; stars: number };

/** Lee el JSON guardado; los torneos viejos no tienen `stars`. */
export function parsePrizes(json: unknown): TournamentPrize[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((p: { rank?: number; credits?: number; stars?: number }) => ({
      rank: Number(p?.rank ?? 0),
      credits: Number(p?.credits ?? 0),
      stars: Number(p?.stars ?? 0),
    }))
    .filter((p) => p.rank > 0 && (p.credits > 0 || p.stars > 0))
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Arma los premios a partir de dos listas separadas por coma (créditos y estrellas por puesto: 1°, 2°…).
 * Un puesto sin créditos ni estrellas se descarta.
 */
export function prizesFromLists(credits: string, stars: string): TournamentPrize[] {
  const split = (s: string) => s.split(",").map((x) => x.trim());
  const c = credits.trim() ? split(credits) : [];
  const st = stars.trim() ? split(stars) : [];
  const out: TournamentPrize[] = [];
  for (let i = 0; i < Math.max(c.length, st.length); i++) {
    const p = { rank: i + 1, credits: Number(c[i] || 0), stars: Number(st[i] || 0) };
    if (p.credits !== 0 || p.stars !== 0 || Number.isNaN(p.credits) || Number.isNaN(p.stars)) out.push(p);
  }
  return out;
}

/** "150 créditos + 5 ⭐" */
export function prizeText(p: { credits: number; stars: number }) {
  const parts = [];
  if (p.credits > 0) parts.push(`${p.credits} créditos`);
  if (p.stars > 0) parts.push(`${p.stars} ⭐`);
  return parts.join(" + ");
}

/** Una de las dos listas para el formulario ("150, 75, 30"); vacía si ningún puesto da eso. */
export function prizeList(json: unknown, field: "credits" | "stars") {
  const prizes = parsePrizes(json);
  const out: number[] = [];
  for (const p of prizes) out[p.rank - 1] = p[field];
  const values = Array.from(out, (x) => x ?? 0);
  while (values.length && values[values.length - 1] === 0) values.pop();
  return values.join(", ");
}
