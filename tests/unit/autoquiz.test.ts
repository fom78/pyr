import { describe, expect, it } from "vitest";
import { describeCadence, gridSlots, upcomingSlots } from "@/server/autoquiz/slots";
import { pickQuestions, remainingMix } from "@/server/autoquiz/pick";
import { projectCoverage } from "@/server/autoquiz/coverage";
import { renderTitle } from "@/server/autoquiz/title";

const DAY = 86_400_000;
const TZ = "America/Argentina/Buenos_Aires"; // UTC-3 sin horario de verano
const noRandom = () => 0.999; // con este rng el barajado deja el orden de prioridad

describe("upcomingSlots / gridSlots", () => {
  const H = 3_600_000;
  // Lunes 27/10/2025 20:00 en Buenos Aires
  const anchorAt = new Date("2025-10-27T23:00:00Z");
  const iso = (ds: Date[]) => ds.map((d) => d.toISOString());

  it("cada 24 h a la misma hora local, salteando los días excluidos sin correr la grilla", () => {
    const schedule = { anchorAt, frequencyHours: 24, excludedWeekdays: [0, 2, 4, 6], timezone: TZ };
    const from = new Date("2025-10-28T10:00:00Z"); // martes
    expect(iso(upcomingSlots(schedule, from, new Date(from.getTime() + 7 * DAY)))).toEqual([
      "2025-10-29T23:00:00.000Z", // mié
      "2025-10-31T23:00:00.000Z", // vie (cruza fin de mes)
      "2025-11-03T23:00:00.000Z", // lun
    ]);
  });

  it("36 h (no divide 24): horas absolutas; el turno en día excluido se marca y el siguiente no se mueve", () => {
    const schedule = { anchorAt, frequencyHours: 36, excludedWeekdays: [0], timezone: TZ };
    const until = new Date("2025-11-04T12:00:00Z");
    const grid = gridSlots(schedule, anchorAt, until);
    expect(grid.map((g) => [g.at.toISOString(), g.excluded])).toEqual([
      ["2025-10-29T11:00:00.000Z", false], // mié 08:00
      ["2025-10-30T23:00:00.000Z", false], // jue 20:00
      ["2025-11-01T11:00:00.000Z", false], // sáb 08:00
      ["2025-11-02T23:00:00.000Z", true], // dom 20:00 → excluido
      ["2025-11-04T11:00:00.000Z", false], // mar 08:00 (36 h después del domingo, no del sábado)
    ]);
    expect(upcomingSlots(schedule, anchorAt, until)).toHaveLength(4);
  });

  it("el día excluido se evalúa en hora local: 22:00 del sábado en Buenos Aires es domingo en UTC", () => {
    const sat22 = new Date("2025-11-02T01:00:00Z"); // sáb 1/11 22:00 local
    const schedule = { anchorAt: sat22, frequencyHours: 24, excludedWeekdays: [0], timezone: TZ };
    expect(gridSlots(schedule, new Date(sat22.getTime() - 1), sat22)).toEqual([{ at: sat22, excluded: false }]);
  });

  it("con el ancla en el futuro arranca en el ancla; 12 h da dos turnos por día", () => {
    const schedule = { anchorAt, frequencyHours: 12, excludedWeekdays: [], timezone: TZ };
    const from = new Date(anchorAt.getTime() - 10 * DAY);
    expect(iso(upcomingSlots(schedule, from, new Date(anchorAt.getTime() + 24 * H)))).toEqual([
      "2025-10-27T23:00:00.000Z",
      "2025-10-28T11:00:00.000Z",
      "2025-10-28T23:00:00.000Z",
    ]);
  });

  it("cambio de horario: con 24 h mantiene la hora de pared; con 36 h, horas absolutas", () => {
    const ny = "America/New_York"; // el 2/11/2025 pasa de UTC-4 a UTC-5
    const a = new Date("2025-11-01T00:00:00Z"); // vie 31/10 20:00 EDT
    const daily = { anchorAt: a, frequencyHours: 24, excludedWeekdays: [], timezone: ny };
    expect(iso(upcomingSlots(daily, a, new Date("2025-11-04T00:00:00Z")))).toEqual([
      "2025-11-02T00:00:00.000Z", // sáb 20:00 EDT
      "2025-11-03T01:00:00.000Z", // dom 20:00 EST
    ]);
    const every36 = { ...daily, frequencyHours: 36 };
    expect(iso(upcomingSlots(every36, a, new Date("2025-11-04T00:00:00Z")))).toEqual([
      "2025-11-02T12:00:00.000Z",
      "2025-11-04T00:00:00.000Z",
    ]);
  });

  it("frecuencia inválida no genera nada", () => {
    const from = new Date();
    expect(upcomingSlots({ anchorAt, frequencyHours: 0, excludedWeekdays: [], timezone: TZ }, from, new Date(from.getTime() + DAY))).toEqual([]);
  });
});

describe("describeCadence", () => {
  it("arma el texto para jugadores", () => {
    expect(describeCadence({ frequencyHours: 24, excludedWeekdays: [] })).toBe("todos los días");
    expect(describeCadence({ frequencyHours: 24, excludedWeekdays: [0] })).toBe("todos los días salvo dom");
    expect(describeCadence({ frequencyHours: 12, excludedWeekdays: [2, 4] })).toBe("cada 12 h salvo mar y jue");
    expect(describeCadence({ frequencyHours: 48, excludedWeekdays: [] })).toBe("cada 2 días");
  });
});

describe("pickQuestions", () => {
  const fresh = (id: string, difficulty: number, daysAgo: number) => ({
    id,
    difficulty,
    createdAt: new Date(Date.now() - daysAgo * DAY),
  });
  const reusable = (id: string, difficulty: number, lastUsedDaysAgo: number) => ({
    id,
    difficulty,
    lastUsedAt: new Date(Date.now() - lastUsedDaysAgo * DAY),
  });

  it("usa primero nunca usadas, priorizando las más antiguas del banco", () => {
    const r = pickQuestions(
      { fresh: [fresh("nueva", 2, 1), fresh("vieja", 2, 100), fresh("media", 2, 50)], reusable: [reusable("r1", 2, 400)] },
      2,
      null,
      { allowReuse: true, rng: noRandom },
    );
    expect(r.missing).toBe(0);
    expect(r.picks.every((p) => !p.reused)).toBe(true);
    expect(new Set(r.picks.map((p) => p.id))).toEqual(new Set(["vieja", "media"]));
  });

  it("si faltan nuevas completa con reutilizadas, la de uso más viejo primero", () => {
    const r = pickQuestions(
      {
        fresh: [fresh("f1", 1, 10)],
        reusable: [reusable("reciente", 1, 200), reusable("antigua", 1, 900), reusable("media", 1, 500)],
      },
      3,
      null,
      { allowReuse: true, rng: noRandom },
    );
    expect(r.picks).toEqual([
      { id: "f1", reused: false },
      { id: "antigua", reused: true },
      { id: "media", reused: true },
    ]);
  });

  it("sin permiso de reutilizar queda incompleto", () => {
    const r = pickQuestions({ fresh: [fresh("f1", 1, 10)], reusable: [reusable("r1", 1, 900)] }, 3, null, { allowReuse: false });
    expect(r.picks).toEqual([{ id: "f1", reused: false }]);
    expect(r.missing).toBe(2);
  });

  it("respeta la mezcla de dificultad y rellena con cualquier dificultad", () => {
    const pool = [fresh("d1a", 1, 5), fresh("d1b", 1, 5), fresh("d3a", 3, 5), fresh("d2a", 2, 5), fresh("d2b", 2, 5)];
    const r = pickQuestions({ fresh: pool, reusable: [] }, 4, { "1": 1, "3": 1 }, { allowReuse: true });
    const ids = r.picks.map((p) => p.id);
    expect(ids).toHaveLength(4);
    expect(ids).toContain("d3a");
    expect(ids.some((id) => id.startsWith("d1"))).toBe(true);
    expect(new Set(ids).size).toBe(4);
  });

  it("si falta una dificultad de la mezcla, usa nuevas de otra antes que reutilizar", () => {
    const r = pickQuestions(
      { fresh: [fresh("d1", 1, 5), fresh("d2", 2, 5)], reusable: [reusable("r5", 5, 900)] },
      2,
      { "5": 1 },
      { allowReuse: true, rng: noRandom },
    );
    expect(r.picks.every((p) => !p.reused)).toBe(true);
  });

  it("si faltan nuevas, la reutilizada se elige de la dificultad que pedía la mezcla", () => {
    const r = pickQuestions(
      { fresh: [fresh("d1", 1, 5)], reusable: [reusable("r2", 2, 900), reusable("r5", 5, 300)] },
      2,
      { "5": 1 },
      { allowReuse: true, rng: noRandom },
    );
    expect(r.picks).toEqual([
      { id: "d1", reused: false },
      { id: "r5", reused: true },
    ]);
  });
});

describe("projectCoverage", () => {
  const now = new Date("2025-11-01T12:00:00Z");
  const slot = (days: number, reserved = 0) => ({ at: new Date(now.getTime() + days * DAY), reserved });
  const base = { perQuiz: 5, now, warnDays: 21, criticalDays: 7 };

  it("alcanza: nivel OK y cubre hasta el último turno", () => {
    const c = projectCoverage({ ...base, slots: [slot(2), slot(4), slot(6)], fresh: 15, reusable: 0 });
    expect(c.level).toBe("OK");
    expect(c.freshCoveredUntil).toEqual(slot(6).at);
    expect(c.freshShortfall).toBe(0);
  });

  it("los turnos con borrador ya tienen sus preguntas reservadas", () => {
    const c = projectCoverage({ ...base, slots: [slot(2, 5), slot(4, 5), slot(6)], fresh: 5, reusable: 0 });
    expect(c.level).toBe("OK");
  });

  it("aviso: no alcanzan para la ventana de aviso pero sí para la crítica", () => {
    const c = projectCoverage({ ...base, slots: [slot(2), slot(5), slot(10), slot(15)], fresh: 12, reusable: 0 });
    expect(c.level).toBe("WARNING");
    expect(c.freshCoveredUntil).toEqual(slot(5).at);
    expect(c.firstShortSlot).toEqual(slot(10).at);
    expect(c.freshShortfall).toBe(8); // 3 al turno del día 10 + 5 al del día 15
  });

  it("crítico: no alcanza ni para la semana; las reutilizadas cubren pero el nivel no baja", () => {
    const c = projectCoverage({ ...base, slots: [slot(2), slot(5)], fresh: 7, reusable: 50 });
    expect(c.level).toBe("CRITICAL");
    expect(c.freshShortfall).toBe(3);
    expect(c.totalShortfall).toBe(0);
    expect(c.totalCoveredUntil).toEqual(slot(5).at);
  });

  it("los faltantes fuera de la ventana de aviso no cuentan para el nivel", () => {
    const c = projectCoverage({ ...base, slots: [slot(2), slot(30)], fresh: 5, reusable: 0 });
    expect(c.level).toBe("OK");
    expect(c.firstShortSlot).toEqual(slot(30).at);
    expect(c.freshShortfall).toBe(0);
  });
});

describe("renderTitle", () => {
  it("reemplaza variables", () => {
    expect(renderTitle("{categoria} #{n} · {fecha}", { categoria: "Fútbol", fecha: "lun 3/11", n: 12 })).toBe(
      "Fútbol #12 · lun 3/11",
    );
  });
  it("si la plantilla queda vacía usa una por defecto", () => {
    expect(renderTitle("  ", { categoria: "Cine", fecha: "mié 5/11", n: 1 })).toBe("Cine · mié 5/11");
  });
});

describe("remainingMix", () => {
  it("descuenta las dificultades que el borrador ya tiene", () => {
    expect(remainingMix({ "1": 2, "3": 1 }, [1, 3, 5])).toEqual({ "1": 1 });
    expect(remainingMix({ "2": 1 }, [2, 2])).toEqual({});
    expect(remainingMix(null, [1])).toBeNull();
  });
});
