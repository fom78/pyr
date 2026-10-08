import { describe, expect, it } from "vitest";
import { getStrategy } from "@/server/wildcards/strategies";
import { scoreAnswer, totalize } from "@/server/scoring/scoring";
import type { WildcardType } from "@/generated/prisma/enums";

const S = { base: 100, timeBonus: 50, wrongPenalty: 0 };
// 4 preguntas: acierto instantáneo, error, acierto a mitad de tiempo, acierto al límite
const answers = [
  { isCorrect: true, timeMs: 0, limitMs: 20000 },
  { isCorrect: false, timeMs: 5000, limitMs: 20000 },
  { isCorrect: true, timeMs: 10000, limitMs: 20000 },
  { isCorrect: true, timeMs: 20000, limitMs: 20000 },
];

function play(type: WildcardType, randomInt: (n: number) => number = () => 0) {
  const st = getStrategy(type);
  const state = st.init({ questionCount: answers.length, randomInt });
  const scored = answers.map((a, i) => ({ ...a, ...scoreAnswer(a, S, st.multipliers(i, state)) }));
  return { total: st.finalize(totalize(scored).score, state), state, st };
}

describe("comodines", () => {
  const plain = 150 + 0 + 125 + 100; // 375

  it("doble total duplica el total", () => {
    expect(play("DOUBLE_TOTAL").total).toBe(plain * 2);
  });

  it("doble total no duplica un total negativo", () => {
    expect(getStrategy("DOUBLE_TOTAL").finalize(-50, {})).toBe(-50);
  });

  it("doble por acierto duplica solo la base de los aciertos", () => {
    expect(play("DOUBLE_PER_CORRECT").total).toBe(plain + 300);
  });

  it("triple sorpresa triplica las 2 preguntas sorteadas si son correctas", () => {
    // randomInt siempre 0 → elige índices 0 y 1 (la 1 es incorrecta → no suma)
    const { total, state, st } = play("TRIPLE_SURPRISE", () => 0);
    expect(state.indexes).toEqual([0, 1]);
    expect(total).toBe(plain + 150 * 2);
    expect(st.reveal(state)).toContain("#1");
  });

  it("triple sorpresa elige preguntas distintas y válidas", () => {
    const st = getStrategy("TRIPLE_SURPRISE");
    for (let k = 0; k < 50; k++) {
      const idx = st.init({ questionCount: 5, randomInt: (n) => Math.floor(Math.random() * n) }).indexes as number[];
      expect(new Set(idx).size).toBe(2);
      expect(idx.every((i) => i >= 0 && i < 5)).toBe(true);
    }
  });

  it("triple sorpresa con 1 sola pregunta elige 1", () => {
    const st = getStrategy("TRIPLE_SURPRISE");
    expect((st.init({ questionCount: 1, randomInt: () => 0 }).indexes as number[]).length).toBe(1);
  });
});
