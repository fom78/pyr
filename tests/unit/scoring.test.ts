import { describe, expect, it } from "vitest";
import { compareResults, scoreAnswer, totalize } from "@/server/scoring/scoring";

const S = { base: 100, timeBonus: 50, wrongPenalty: 0 };

describe("scoreAnswer", () => {
  it("acierto instantáneo suma base + bonus completo", () => {
    expect(scoreAnswer({ isCorrect: true, timeMs: 0, limitMs: 20000 }, S)).toEqual({ basePoints: 100, bonusPoints: 50, points: 150 });
  });
  it("acierto a mitad de tiempo suma la mitad del bonus", () => {
    expect(scoreAnswer({ isCorrect: true, timeMs: 10000, limitMs: 20000 }, S).points).toBe(125);
  });
  it("acierto al límite (o pasado) no tiene bonus", () => {
    expect(scoreAnswer({ isCorrect: true, timeMs: 20000, limitMs: 20000 }, S).points).toBe(100);
    expect(scoreAnswer({ isCorrect: true, timeMs: 25000, limitMs: 20000 }, S).points).toBe(100);
  });
  it("incorrecta suma 0 sin penalización", () => {
    expect(scoreAnswer({ isCorrect: false, timeMs: 1000, limitMs: 20000 }, S).points).toBe(0);
  });
  it("incorrecta resta con penalización activada", () => {
    expect(scoreAnswer({ isCorrect: false, timeMs: 1000, limitMs: 20000 }, { ...S, wrongPenalty: 25 }).points).toBe(-25);
  });
  it("anulada no suma ni resta", () => {
    expect(scoreAnswer({ isCorrect: false, timeMs: 1000, limitMs: 20000, voided: true }, { ...S, wrongPenalty: 25 }).points).toBe(0);
  });
  it("aplica multiplicadores por separado a base y bonus", () => {
    expect(scoreAnswer({ isCorrect: true, timeMs: 0, limitMs: 20000 }, S, { base: 2, bonus: 1 }).points).toBe(250);
    expect(scoreAnswer({ isCorrect: true, timeMs: 0, limitMs: 20000 }, S, { base: 3, bonus: 3 }).points).toBe(450);
  });
  it("redondea el bonus", () => {
    expect(scoreAnswer({ isCorrect: true, timeMs: 3333, limitMs: 10000 }, S).bonusPoints).toBe(33);
  });
});

describe("totalize", () => {
  it("ignora anuladas en puntos, aciertos y tiempo", () => {
    const t = totalize([
      { isCorrect: true, timeMs: 1000, basePoints: 100, bonusPoints: 40, points: 140 },
      { isCorrect: false, timeMs: 5000, basePoints: 0, bonusPoints: 0, points: 0 },
      { isCorrect: true, timeMs: 9000, basePoints: 0, bonusPoints: 0, points: 0, voided: true },
    ]);
    expect(t).toEqual({ score: 140, correctCount: 1, totalTimeMs: 6000 });
  });
});

describe("compareResults (desempates)", () => {
  const base = { score: 500, correctCount: 4, totalTimeMs: 30000, finishedAt: new Date("2026-01-01T10:00:00Z") };
  it("más puntos primero", () => {
    expect(compareResults({ ...base, score: 600 }, base)).toBeLessThan(0);
  });
  it("a igual puntaje, más aciertos", () => {
    expect(compareResults({ ...base, correctCount: 5 }, base)).toBeLessThan(0);
  });
  it("a igual puntaje y aciertos, menos tiempo", () => {
    expect(compareResults({ ...base, totalTimeMs: 20000 }, base)).toBeLessThan(0);
  });
  it("si todo empata, quien terminó antes", () => {
    expect(compareResults({ ...base, finishedAt: new Date("2026-01-01T09:00:00Z") }, base)).toBeLessThan(0);
    expect(compareResults(base, base)).toBe(0);
  });
});
