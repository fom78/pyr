import { describe, expect, it } from "vitest";
import { timelineIssues, tournamentTimeline } from "@/server/tournaments/timeline";
import { pickAcrossCategories, splitQuota } from "@/server/tournaments/pick";
import { percentile, summarizeResults } from "@/server/player/tournament-summary";
import { toDateTimeInput } from "@/lib/format";

const BA = "America/Argentina/Buenos_Aires";
const local = (d: Date, tz = BA) => toDateTimeInput(d, tz);
const base = { quizCount: 7, frequencyHours: 24, quizActiveHours: 24, registrationLeadDays: 3, lateEntryDays: 0 };

describe("tournamentTimeline", () => {
  const startsAt = new Date("2026-10-23T23:00:00Z"); // jue 23/10 20:00 en Buenos Aires
  const now = new Date("2026-10-15T12:00:00Z");

  it("torneo semanal: 7 fechas diarias a la misma hora, termina 24 h después de la última", () => {
    const t = tournamentTimeline({ ...base, startsAt }, now);
    expect(t.slots.map((d) => local(d))).toEqual([
      "2026-10-23T20:00",
      "2026-10-24T20:00",
      "2026-10-25T20:00",
      "2026-10-26T20:00",
      "2026-10-27T20:00",
      "2026-10-28T20:00",
      "2026-10-29T20:00",
    ]);
    expect(local(t.endsAt)).toBe("2026-10-30T20:00");
    expect(local(t.registrationOpensAt)).toBe("2026-10-20T20:00"); // 3 días antes
    expect(t.registrationEndsAt).toEqual(startsAt); // sin inscripción tardía
  });

  it("12 h en horas absolutas; inscripción tardía con tope en el último turno; anticipación 0 = ahora", () => {
    const t = tournamentTimeline({ ...base, startsAt, quizCount: 4, frequencyHours: 12, quizActiveHours: 12, registrationLeadDays: 0, lateEntryDays: 5 }, now);
    expect(t.slots.map((d) => d.getTime() - startsAt.getTime())).toEqual([0, 12, 24, 36].map((h) => h * 3_600_000));
    expect(t.registrationOpensAt).toEqual(now);
    expect(t.registrationEndsAt).toEqual(t.slots.at(-1)); // 5 días > duración: se corta en el último turno
  });

  it("múltiplos de 24 mantienen la hora de pared con cambio de horario", () => {
    const ny = "America/New_York";
    const t = tournamentTimeline({ ...base, startsAt: new Date("2026-10-31T22:00:00Z"), quizCount: 3 }, now, ny); // sáb 18:00 EDT
    expect(t.slots.map((d) => local(d, ny))).toEqual(["2026-10-31T18:00", "2026-11-01T18:00", "2026-11-02T18:00"]);
  });

  it("valida inscripción tardía y vigencia", () => {
    expect(timelineIssues({ ...base, startsAt, lateEntryDays: 10 }).map((i) => i.field)).toEqual(["lateEntryDays"]);
    expect(timelineIssues({ ...base, startsAt, quizCount: 1, quizActiveHours: 48 }).map((i) => i.field)).toEqual(["quizActiveHours"]);
    expect(timelineIssues({ ...base, startsAt })).toEqual([]);
  });
});

describe("preguntas de torneo entre categorías", () => {
  const fresh = (ids: string[]) => ids.map((id, i) => ({ id, difficulty: 3, createdAt: new Date(2026, 0, i + 1) }));
  const old = (ids: string[]) => ids.map((id, i) => ({ id, difficulty: 3, lastUsedAt: new Date(2025, 0, i + 1) }));
  const rng = () => 0.5;

  it("reparte en partes parejas", () => {
    expect(splitQuota(10, 3)).toEqual([4, 3, 3]);
    expect(splitQuota(2, 3)).toEqual([1, 1, 0]);
  });

  it("nuevas repartidas; si una categoría no alcanza completa con las otras antes de reutilizar", () => {
    const pools = [
      { fresh: fresh(["a1"]), reusable: old(["ra"]) },
      { fresh: fresh(["b1", "b2", "b3", "b4"]), reusable: [] },
    ];
    const r = pickAcrossCategories(pools, 4, { allowReuse: true, rng });
    expect(r.missing).toBe(0);
    expect(r.picks.every((p) => !p.reused)).toBe(true);
    expect(r.picks.map((p) => p.id)).toContain("a1");
  });

  it("una pregunta de dos categorías no se repite; reutiliza solo si se permite", () => {
    const pools = [
      { fresh: fresh(["x"]), reusable: old(["r1"]) },
      { fresh: fresh(["x"]), reusable: old(["r1"]) },
    ];
    const withReuse = pickAcrossCategories(pools, 3, { allowReuse: true, rng });
    expect(withReuse.picks.map((p) => p.id).sort()).toEqual(["r1", "x"]);
    expect(withReuse.missing).toBe(1);
    expect(pickAcrossCategories(pools, 3, { allowReuse: false, rng }).picks.map((p) => p.id)).toEqual(["x"]);
  });
});

describe("resumen de torneos del perfil", () => {
  it("podios, mejor puesto, top 10 % y premios", () => {
    const s = summarizeResults([
      { rank: 1, participants: 20, prizeCredits: 150, points: 900 },
      { rank: 3, participants: 10, prizeCredits: 30, points: 700 },
      { rank: 8, participants: 40, prizeCredits: 0, points: 400 },
      { rank: 15, participants: 15, prizeCredits: 0, points: 100 },
    ]);
    expect(s).toMatchObject({ played: 4, podiums: { first: 1, second: 0, third: 1 }, bestRank: 1, topTen: 1, prizeCredits: 180 });
    expect(s.avgPercentile).toBe(Math.round((100 + 78 + 82 + 0) / 4));
  });

  it("sin torneos y percentiles límite", () => {
    expect(summarizeResults([])).toMatchObject({ played: 0, bestRank: null, avgPercentile: null });
    expect(percentile(1, 1)).toBe(100);
    expect(percentile(10, 10)).toBe(0);
  });
});
