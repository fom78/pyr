import { describe, expect, it } from "vitest";
import {
  countByState,
  filterPending,
  groupByDay,
  parsePendingFilters,
  pendingOwners,
  type PendingDraft,
} from "@/server/autoquiz/pending";

const H = 3_600_000;
const now = new Date("2026-11-02T15:00:00Z"); // 12:00 en Buenos Aires
const TZ = "America/Argentina/Buenos_Aires";

let n = 0;
function d(over: Partial<PendingDraft> & { inHours: number }): PendingDraft {
  const { inHours, ...rest } = over;
  return {
    id: `q${++n}`,
    title: `Cuestionario ${n}`,
    opensAt: new Date(now.getTime() + inHours * H),
    category: { id: "cine", name: "Cine", icon: "🎬" },
    tournament: false,
    questions: 10,
    expected: 10,
    reused: 0,
    urgent: false,
    autoPublishAt: null,
    ...rest,
  };
}

const historia = { id: "historia", name: "Historia", icon: "📜" };
const copa = { id: "t1", name: "Copa Otoño", icon: "🏆" };
const list = [
  d({ inHours: 2, urgent: true }),
  d({ inHours: 20, questions: 6, category: historia }),
  d({ inHours: 30, reused: 3, category: copa, tournament: true, title: "Copa Otoño — Fecha 2" }),
  d({ inHours: 100, category: historia, title: "Próceres argentinos" }),
];

describe("parsePendingFilters", () => {
  it("lee los parámetros de la URL e ignora valores inválidos", () => {
    expect(parsePendingFilters({ q: " copa ", origen: "torneo", estado: "urgentes", abre: "72", de: "t1" })).toEqual({
      q: "copa",
      origin: "torneo",
      owner: "t1",
      state: "urgentes",
      within: 72,
    });
    expect(parsePendingFilters({ origen: "otro", estado: "x", abre: "5" })).toEqual({
      q: undefined,
      origin: undefined,
      owner: undefined,
      state: undefined,
      within: undefined,
    });
  });
});

describe("filterPending", () => {
  it("filtra por estado, origen, dueño, ventana y texto (sin tildes ni mayúsculas)", () => {
    const ids = (f: Parameters<typeof filterPending>[1]) => filterPending(list, f, now).map((x) => x.id);
    expect(ids({ state: "urgentes" })).toEqual([list[0].id]);
    expect(ids({ state: "incompletos" })).toEqual([list[1].id]);
    expect(ids({ state: "reutilizadas" })).toEqual([list[2].id]);
    expect(ids({ state: "listos" })).toEqual([list[0].id, list[2].id, list[3].id]);
    expect(ids({ origin: "torneo" })).toEqual([list[2].id]);
    expect(ids({ owner: "historia" })).toEqual([list[1].id, list[3].id]);
    expect(ids({ within: 24 })).toEqual([list[0].id, list[1].id]);
    expect(ids({ q: "PROCERES" })).toEqual([list[3].id]);
    expect(ids({ q: "historia", state: "incompletos" })).toEqual([list[1].id]);
  });

  it("cuenta por estado", () => {
    expect(countByState(list)).toEqual({ total: 4, urgentes: 1, incompletos: 1, reutilizadas: 1, listos: 3 });
  });
});

describe("pendingOwners / groupByDay", () => {
  it("lista categorías antes que torneos, con su cantidad", () => {
    expect(pendingOwners(list).map((o) => [o.name, o.count])).toEqual([
      ["Cine", 1],
      ["Historia", 2],
      ["Copa Otoño", 1],
    ]);
  });

  it("agrupa por día local de apertura", () => {
    // 2 h → 14:00 hoy; 20 h → 08:00 del 3; 30 h → 18:00 del 3; 100 h → 6/11.
    expect(groupByDay(list, TZ).map((g) => [g.day, g.items.length])).toEqual([
      ["2026-11-02", 1],
      ["2026-11-03", 2],
      ["2026-11-06", 1],
    ]);
  });
});
