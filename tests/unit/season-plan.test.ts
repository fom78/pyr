import { describe, expect, it } from "vitest";
import { addDays, creationOrder, seasonQuestionNeed, seasonTimeline, validateSeason, type StagePlan } from "@/server/seasons/plan";

const HOUR = 3_600_000;

function stage(id: string, over: Partial<StagePlan> = {}): StagePlan {
  return {
    id,
    name: id,
    position: 0,
    offsetDays: 0,
    startTime: "20:00",
    format: "POINTS",
    quizCount: 7,
    frequencyHours: 24,
    quizActiveHours: 24,
    registrationLeadDays: 3,
    lateEntryDays: 0,
    questionsPerQuiz: 10,
    maxParticipants: null,
    uniqueQuestions: null,
    thirdPlaceMatch: false,
    ...over,
  };
}

const ko = (id: string, over: Partial<StagePlan> = {}) => stage(id, { format: "KNOCKOUT", maxParticipants: 16, registrationLeadDays: 0, ...over });

describe("temporadas: plan", () => {
  it("fechas relativas al día 0, a hora local (aunque haya cambio de horario en el medio)", () => {
    const { dates, startsAt, endsAt } = seasonTimeline([stage("a"), ko("oro", { offsetDays: 10 })], "2027-01-04");
    expect(dates.get("a")!.startsAt.toISOString()).toBe("2027-01-04T23:00:00.000Z"); // 20:00 en Buenos Aires
    expect(dates.get("a")!.registrationOpensAt.toISOString()).toBe("2027-01-01T23:00:00.000Z");
    expect(dates.get("oro")!.startsAt.toISOString()).toBe("2027-01-14T23:00:00.000Z");
    // Oro: cuadro de 16 = 4 rondas de 24 h.
    expect(dates.get("oro")!.endsAt.getTime() - dates.get("oro")!.startsAt.getTime()).toBe(4 * 24 * HOUR);
    expect(startsAt).toEqual(dates.get("a")!.startsAt);
    expect(endsAt).toEqual(dates.get("oro")!.endsAt);
    expect(addDays("2027-02-27", 2)).toBe("2027-03-01");
  });

  it("valida orígenes tardíos, rangos pisados, cupos, destinos y ciclos", () => {
    const a = stage("a"); // termina el día 7
    const oro = ko("oro", { offsetDays: 10, maxParticipants: 4 });
    const plata = ko("plata", { offsetDays: 3 });
    const ok = validateSeason([a, oro], [{ sourceStageId: "a", targetStageId: "oro", fromRank: 1, toRank: 4 }]);
    expect(ok).toEqual([]);
    const issues = validateSeason(
      [a, oro, plata],
      [
        { sourceStageId: "a", targetStageId: "oro", fromRank: 1, toRank: 8 },
        { sourceStageId: "a", targetStageId: "plata", fromRank: 5, toRank: 10 },
        { sourceStageId: "oro", targetStageId: "a", fromRank: 1, toRank: 1 },
      ],
    ).join("\n");
    expect(issues).toContain('"a" termina después de que cierra la inscripción de "plata"');
    expect(issues).toContain("se pisan");
    expect(issues).toContain("reservan 8 lugares y el cuadro es de 4");
    expect(issues).toContain('"a" no es una eliminatoria');
    expect(issues).toContain("ciclo");
  });

  it("los orígenes se crean antes que sus eliminatorias", () => {
    const order = creationOrder(
      [ko("final", { offsetDays: 1 }), stage("a", { offsetDays: 5 }), ko("semi", { offsetDays: 0 })],
      [
        { sourceStageId: "a", targetStageId: "semi", fromRank: 1, toRank: 4 },
        { sourceStageId: "semi", targetStageId: "final", fromRank: 1, toRank: 2 },
      ],
    ).map((s) => s.id);
    expect(order).toEqual(["a", "semi", "final"]);
  });

  it("preguntas por instancia", () => {
    // 7 × 10 + cuadro de 16 con 10 por partido (15 partidos, todas distintas)
    expect(seasonQuestionNeed([stage("a"), ko("oro")])).toBe(70 + 150);
  });
});
