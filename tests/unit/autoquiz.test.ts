import { describe, expect, it } from "vitest";
import { upcomingSlots } from "@/server/autoquiz/slots";
import { pickQuestions, remainingMix } from "@/server/autoquiz/pick";
import { projectCoverage } from "@/server/autoquiz/coverage";
import { renderTitle } from "@/server/autoquiz/title";

const DAY = 86_400_000;
const TZ = "America/Argentina/Buenos_Aires"; // UTC-3 sin horario de verano
const noRandom = () => 0.999; // con este rng el barajado deja el orden de prioridad

describe("upcomingSlots", () => {
  const schedule = { weekdays: [1, 3, 5], timeOfDay: "20:00", timezone: TZ };

  it("genera lun/mié/vie a las 20 hora local (23 UTC) dentro del rango", () => {
    // Martes 28/10/2025 10:00 UTC → hasta el martes siguiente
    const from = new Date("2025-10-28T10:00:00Z");
    const slots = upcomingSlots(schedule, from, new Date(from.getTime() + 7 * DAY));
    expect(slots.map((d) => d.toISOString())).toEqual([
      "2025-10-29T23:00:00.000Z", // mié
      "2025-10-31T23:00:00.000Z", // vie (cruza fin de mes)
      "2025-11-03T23:00:00.000Z", // lun
    ]);
  });

  it("el día local manda: a las 22 locales del lunes ya pasó el turno de ese lunes", () => {
    const from = new Date("2025-11-04T01:00:00Z"); // lunes 3/11 22:00 en Buenos Aires
    const [first] = upcomingSlots(schedule, from, new Date(from.getTime() + 3 * DAY));
    expect(first.toISOString()).toBe("2025-11-05T23:00:00.000Z"); // miércoles
  });

  it("sin días o con hora inválida no genera nada", () => {
    const from = new Date();
    expect(upcomingSlots({ ...schedule, weekdays: [] }, from, new Date(from.getTime() + 30 * DAY))).toEqual([]);
    expect(upcomingSlots({ ...schedule, timeOfDay: "25:00" }, from, new Date(from.getTime() + 30 * DAY))).toEqual([]);
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
