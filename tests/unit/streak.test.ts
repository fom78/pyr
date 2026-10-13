import { describe, expect, it } from "vitest";
import { computeStreak } from "@/server/league/streak";

const H = 3_600_000;
const now = new Date("2026-10-13T12:00:00Z");
/** Cuestionario que cierra `h` horas antes (negativo) o después (positivo) de `now`. */
const q = (id: string, h: number) => ({ id, closesAt: new Date(now.getTime() + h * H) });

describe("computeStreak", () => {
  // Diarios con validez de 72 h: a..d cerrados, e..g abiertos.
  const quizzes = [q("a", -96), q("b", -72), q("c", -48), q("d", -24), q("e", 24), q("f", 48), q("g", 72)];

  it("suma los jugados seguidos hasta el último cerrado sin jugar", () => {
    expect(computeStreak(quizzes, new Set(["b", "c", "d", "e"]), now)).toBe(4);
    expect(computeStreak(quizzes, new Set(["a", "c", "d"]), now)).toBe(2); // b cerró sin jugar
  });

  it("los abiertos sin jugar no cortan, y el orden en que se juegan no importa", () => {
    expect(computeStreak(quizzes, new Set(["c", "d", "g"]), now)).toBe(3); // e y f pendientes
    expect(computeStreak(quizzes, new Set(["c", "d", "e", "f", "g"]), now)).toBe(5);
  });

  it("los cerrados antes de entrar a la categoría no cuentan como salteados", () => {
    const joined = new Date(now.getTime() - 30 * H); // entró después de que cerrara c
    expect(computeStreak(quizzes, new Set(["d", "e"]), now, joined)).toBe(2);
    expect(computeStreak(quizzes, new Set(["e"]), now, joined)).toBe(1); // d cerró sin jugar estando adentro: corta antes de e
  });

  it("sin jugados da 0", () => {
    expect(computeStreak(quizzes, new Set(), now)).toBe(0);
  });
});
