import { describe, expect, it } from "vitest";
import {
  bracketQuestionNeed,
  bracketSize,
  matchQuestionSplit,
  decideMatch,
  finalRanks,
  firstRoundPairs,
  nextSlot,
  roundName,
  seedOrder,
  seedPlayers,
  type BracketMatch,
} from "@/server/tournaments/bracket";

describe("cuadro de eliminatoria", () => {
  it("tamaño: la menor potencia de 2 que cubre, con tope", () => {
    expect(bracketSize(62, 64)).toBe(64);
    expect(bracketSize(31, 64)).toBe(32);
    expect(bracketSize(3, 64)).toBe(4);
    expect(bracketSize(2, 64)).toBe(2);
    expect(bracketSize(100, 64)).toBe(64);
  });

  it("siembra estándar: el 1 y el 2 en mitades opuestas", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const order = seedOrder(64);
    expect(order.indexOf(1) < 32).toBe(true);
    expect(order.indexOf(2) >= 32).toBe(true);
  });

  it("los pases libres van a los mejores sembrados", () => {
    // 62 en un cuadro de 64: el 1 y el 2 pasan directo
    const pairs = firstRoundPairs(62, 64);
    const byes = pairs.filter(([, b]) => b === null).map(([a]) => a);
    expect(byes.sort()).toEqual([1, 2]);
    // 5 en 8: pasan 1, 2 y 3; juegan 4 contra 5
    expect(firstRoundPairs(5, 8)).toEqual([
      [1, null],
      [4, 5],
      [2, null],
      [3, null],
    ]);
  });

  it("el ganador avanza a la mitad de la posición", () => {
    expect(nextSlot(1, 0)).toEqual({ round: 2, position: 0, side: "A" });
    expect(nextSlot(1, 3)).toEqual({ round: 2, position: 1, side: "B" });
  });

  it("decide: puntos, desempates y W.O.", () => {
    const r = (score: number, correctCount = 5, totalTimeMs = 1000) => ({ score, correctCount, totalTimeMs });
    const a = { userId: "a", seed: 3 };
    const b = { userId: "b", seed: 6 };
    expect(decideMatch({ ...a, result: r(500) }, { ...b, result: r(700) })).toEqual({ winnerId: "b", loserId: "a", result: "PLAYED" });
    expect(decideMatch({ ...a, result: r(500, 4) }, { ...b, result: r(500, 5) }).winnerId).toBe("b");
    expect(decideMatch({ ...a, result: r(500, 5, 900) }, { ...b, result: r(500, 5, 1000) }).winnerId).toBe("a");
    expect(decideMatch({ ...a, result: r(500) }, { ...b, result: r(500) })).toEqual({ winnerId: "a", loserId: "b", result: "TIEBREAK" });
    expect(decideMatch({ ...a, result: null }, { ...b, result: r(0) })).toEqual({ winnerId: "b", loserId: "a", result: "WALKOVER" });
    expect(decideMatch({ ...b, result: null }, { ...a, result: null })).toEqual({ winnerId: "a", loserId: "b", result: "WALKOVER" });
  });

  it("nombres de ronda", () => {
    expect(roundName(3, 3)).toBe("Final");
    expect(roundName(3, 3, 1)).toBe("Tercer puesto");
    expect(roundName(2, 3)).toBe("Semifinal");
    expect(roundName(1, 3)).toBe("Cuartos de final");
    expect(roundName(1, 5)).toBe("Ronda de 32");
  });

  it("puestos finales por ronda alcanzada, con y sin tercer puesto", () => {
    const m = (round: number, position: number, a: string, b: string | null, w: string, result: BracketMatch["result"] = "PLAYED"): BracketMatch => ({
      round,
      position,
      playerAId: a,
      playerBId: b,
      winnerId: w,
      result,
    });
    const base = [
      m(1, 0, "p1", null, "p1", "BYE"),
      m(1, 1, "p4", "p5", "p4"),
      m(1, 2, "p2", "p7", "p2"),
      m(1, 3, "p3", "p6", "p6"),
      m(2, 0, "p1", "p4", "p1"),
      m(2, 1, "p2", "p6", "p6"),
      m(3, 0, "p1", "p6", "p6"),
    ];
    const ranks = finalRanks(base, 3, false);
    expect(Object.fromEntries(ranks)).toEqual({ p6: 1, p1: 2, p4: 3, p2: 3, p5: 5, p7: 5, p3: 5 });
    const third = finalRanks([...base, m(3, 1, "p4", "p2", "p2")], 3, true);
    expect(third.get("p2")).toBe(3);
    expect(third.get("p4")).toBe(4);
  });

  it("siembra por clasificación: puesto, después percentil en su torneo, después historial", () => {
    const order = seedPlayers(
      [
        { userId: "abierto", qualifiedRank: null, sourcePercentile: null, avgPercentile: 90 },
        { userId: "segundo", qualifiedRank: 2, sourcePercentile: 99, avgPercentile: null },
        { userId: "primero-chico", qualifiedRank: 1, sourcePercentile: 100, avgPercentile: null },
        { userId: "nuevo", qualifiedRank: null, sourcePercentile: null, avgPercentile: null },
        { userId: "primero-grande", qualifiedRank: 1, sourcePercentile: 100, avgPercentile: 80 },
      ],
      "QUALIFICATION",
      () => 0.5,
    );
    expect(order.slice(2)).toEqual(["segundo", "abierto", "nuevo"]);
    expect(order.slice(0, 2).sort()).toEqual(["primero-chico", "primero-grande"]);
  });

  it("preguntas propias + pozo común de la ronda", () => {
    expect(matchQuestionSplit(10, null)).toEqual({ exclusive: 10, shared: 0, poolSize: 0 });
    expect(matchQuestionSplit(10, 5)).toEqual({ exclusive: 5, shared: 5, poolSize: 10 });
    expect(matchQuestionSplit(10, 12)).toEqual({ exclusive: 10, shared: 0, poolSize: 0 });
    // 64 con 10 por partido: 630 todas distintas; con 5 propias, 63×5 + 6 rondas×10 = 375
    expect(bracketQuestionNeed(64, 10, null, false)).toBe(630);
    expect(bracketQuestionNeed(64, 10, 5, false)).toBe(375);
  });
});
