import { describe, expect, it } from "vitest";
import { computeLeagueStandings, computeTournamentStandings, type AttemptResult } from "@/server/ranking/compute";

const r = (userId: string, quizId: string, score: number, correctCount = 5, totalTimeMs = 10000): AttemptResult => ({
  userId,
  quizId,
  score,
  correctCount,
  totalTimeMs,
  finishedAt: new Date("2026-01-01T00:00:00Z"),
});

describe("computeLeagueStandings", () => {
  it("toma solo los mejores K de cada usuario (ejemplo del enunciado: 12 computables, suman 5)", () => {
    const scores = [300, 900, 100, 800, 700, 200, 600, 50, 400, 500, 1000, 150];
    const results = scores.map((s, i) => r("ana", `q${i}`, s));
    const [row] = computeLeagueStandings(results, 5);
    expect(row.points).toBe(1000 + 900 + 800 + 700 + 600);
    expect(row.quizzesCounted).toBe(5);
  });
  it("si hizo menos de K, suma todos", () => {
    const [row] = computeLeagueStandings([r("ana", "q1", 100), r("ana", "q2", 200)], 5);
    expect(row.points).toBe(300);
    expect(row.quizzesCounted).toBe(2);
  });
  it("ordena y desempata por aciertos y luego tiempo; empate total comparte puesto", () => {
    const rows = computeLeagueStandings(
      [
        r("ana", "q1", 500, 5, 9000),
        r("beto", "q1", 500, 6, 9000),
        r("caro", "q1", 700),
        r("dani", "q1", 500, 5, 9000),
        r("eli", "q1", 500, 5, 8000),
      ],
      5,
    );
    expect(rows.map((x) => [x.userId, x.rank])).toEqual([
      ["caro", 1],
      ["beto", 2],
      ["eli", 3],
      ["ana", 4],
      ["dani", 4],
    ]);
  });
});

describe("computeTournamentStandings", () => {
  it("suma todos los cuestionarios", () => {
    const rows = computeTournamentStandings([r("ana", "q1", 100), r("ana", "q2", 200), r("ana", "q3", 300), r("beto", "q1", 500)]);
    expect(rows[0]).toMatchObject({ userId: "ana", points: 600, quizzesCounted: 3, rank: 1 });
    expect(rows[1]).toMatchObject({ userId: "beto", points: 500, rank: 2 });
  });
});
