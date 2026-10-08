import { describe, expect, it } from "vitest";
import { getQuizStatus, validateQuizTiming } from "@/server/quiz/status";

const d = (s: string) => new Date(s);
const quiz = {
  publishedAt: d("2026-01-01T00:00:00Z"),
  opensAt: d("2026-01-05T00:00:00Z"),
  closesAt: d("2026-01-08T00:00:00Z"),
  expiresAt: d("2026-02-07T00:00:00Z"),
};

describe("getQuizStatus", () => {
  it("sin publicar es DRAFT aunque las fechas pasen", () => {
    expect(getQuizStatus({ ...quiz, publishedAt: null }, d("2026-01-06T00:00:00Z"))).toBe("DRAFT");
  });
  it("recorre todo el ciclo según la fecha", () => {
    expect(getQuizStatus(quiz, d("2026-01-02T00:00:00Z"))).toBe("SCHEDULED");
    expect(getQuizStatus(quiz, d("2026-01-05T00:00:00Z"))).toBe("ACTIVE");
    expect(getQuizStatus(quiz, d("2026-01-07T23:59:59Z"))).toBe("ACTIVE");
    expect(getQuizStatus(quiz, d("2026-01-08T00:00:00Z"))).toBe("CLOSED");
    expect(getQuizStatus(quiz, d("2026-02-07T00:00:00Z"))).toBe("EXPIRED");
  });
});

describe("validateQuizTiming", () => {
  it("acepta fechas coherentes", () => {
    expect(validateQuizTiming(quiz)).toEqual([]);
  });
  it("rechaza cierre antes de apertura", () => {
    expect(validateQuizTiming({ ...quiz, closesAt: quiz.opensAt })).toHaveLength(1);
  });
  it("rechaza vencimiento antes del cierre", () => {
    expect(validateQuizTiming({ ...quiz, expiresAt: d("2026-01-07T00:00:00Z") })).toHaveLength(1);
  });
  it("exige estar dentro de la vigencia del torneo", () => {
    const t = { startsAt: d("2026-01-06T00:00:00Z"), endsAt: d("2026-01-31T00:00:00Z") };
    expect(validateQuizTiming(quiz, t)).toHaveLength(1);
    expect(validateQuizTiming(quiz, { ...t, startsAt: d("2026-01-01T00:00:00Z") })).toEqual([]);
  });
});
