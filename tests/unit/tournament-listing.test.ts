import { describe, expect, it } from "vitest";
import { currentRound, defaultTab, groupTournaments, type ListedTournament } from "@/server/tournaments/listing";

const H = 3_600_000;
const now = new Date("2026-11-01T12:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * H);

let n = 0;
function t(
  over: Partial<ListedTournament> & { start: number; end: number; regOpen?: number; regEnd?: number },
): ListedTournament {
  const { start, end, regOpen = start - 48, regEnd = start, ...rest } = over;
  return {
    id: `t${++n}`,
    status: "PUBLISHED",
    format: "POINTS",
    startsAt: at(start),
    endsAt: at(end),
    registrationOpensAt: at(regOpen),
    registrationEndsAt: at(regEnd),
    maxParticipants: null,
    qualifiers: [],
    ...rest,
  };
}

describe("groupTournaments", () => {
  it("en curso: los míos siempre; para sumarse solo 3 (el que empezó más recién primero) y el resto oculto", () => {
    const mineT = t({ start: -100, end: 50 });
    const joinable = [1, 2, 3, 4].map((i) => t({ start: -i * 10, end: 100, regEnd: 20 }));
    const closed = t({ start: -5, end: 100, regEnd: -5 });
    const g = groupTournaments([mineT, ...joinable, closed], new Set([mineT.id]), now);
    expect(g.active.mine.map((x) => x.id)).toEqual([mineT.id]);
    expect(g.active.joinable.map((x) => x.id)).toEqual(joinable.slice(0, 3).map((x) => x.id));
    expect(g.active.hidden).toBe(2); // el 4º para sumarse + el ya empezado sin inscripción
    expect(g.active.all.started.map((x) => x.id)).toEqual([closed.id]);
    expect(g.mine.map((x) => x.id)).toEqual([mineT.id]);
  });

  it("próximos: primero los de inscripción abierta, ordenados por cierre; las eliminatorias por clasificación van a 'más adelante'", () => {
    const closesLate = t({ start: 100, end: 200, regOpen: -10, regEnd: 90 });
    const closesSoon = t({ start: 30, end: 200, regOpen: -10, regEnd: 20 });
    const notYet = t({ start: 50, end: 200, regOpen: 10, regEnd: 50 });
    const qualifiersOnly = t({
      start: 40,
      end: 80,
      regOpen: -10,
      regEnd: 40,
      format: "KNOCKOUT",
      maxParticipants: 4,
      qualifiers: [{ fromRank: 1, topN: 4 }],
    });
    const g = groupTournaments([closesLate, closesSoon, notYet, qualifiersOnly], new Set(), now);
    expect(g.upcoming.open.map((x) => x.id)).toEqual([closesSoon.id, closesLate.id]);
    expect(g.upcoming.later.map((x) => x.id)).toEqual([qualifiersOnly.id, notYet.id]);
    expect(defaultTab(g)).toBe("proximos");
  });

  it("recorta los próximos a 6 por grupo y cuenta los ocultos", () => {
    const list = Array.from({ length: 8 }, (_, i) => t({ start: 50 + i, end: 300, regOpen: -1, regEnd: 40 + i }));
    const g = groupTournaments(list, new Set(), now);
    expect(g.upcoming.open).toHaveLength(6);
    expect(g.upcoming.hidden).toBe(2);
    expect(g.upcoming.all.open).toHaveLength(8);
  });

  it("ignora los que no están publicados y elige la pestaña por defecto", () => {
    const draft = t({ start: -1, end: 10, status: "DRAFT" });
    const joinable = t({ start: -1, end: 10, regEnd: 5 });
    const g = groupTournaments([draft, joinable], new Set(), now);
    expect(g.active.total).toBe(1);
    expect(defaultTab(g)).toBe("curso");
    expect(defaultTab(groupTournaments([joinable], new Set([joinable.id]), now))).toBe("mios");
  });
});

describe("currentRound", () => {
  it("cuenta la fecha según la frecuencia, sin pasarse de la cantidad", () => {
    const base = { startsAt: at(-50), frequencyHours: 24, quizCount: 5 };
    expect(currentRound(base, now)).toBe(3);
    expect(currentRound({ ...base, startsAt: at(-1000) }, now)).toBe(5);
    expect(currentRound({ ...base, startsAt: at(1) }, now)).toBe(0);
  });
});
