import { prizesFromLists } from "@/server/tournaments/prizes";

/** Campos del formulario de torneo → entrada de `saveTournament` (también la usa la etapa de una temporada). */
export function tournamentFromForm(fd: FormData) {
  return {
    name: fd.get("name"),
    slug: fd.get("slug") || undefined,
    description: fd.get("description") || undefined,
    imageKey: fd.get("imageKey") || undefined,
    categoryIds: fd.getAll("categoryIds").map(String),
    quizCount: fd.get("quizCount"),
    frequencyHours: fd.get("frequencyHours"),
    quizActiveHours: fd.get("quizActiveHours"),
    registrationLeadDays: fd.get("registrationLeadDays"),
    lateEntryDays: fd.get("lateEntryDays"),
    questionsPerQuiz: fd.get("questionsPerQuiz"),
    autoQuizzes: fd.get("autoQuizzes") === "on",
    repeatEveryDays: fd.get("repeatEveryDays") ? Number(fd.get("repeatEveryDays")) : null,
    entryCost: fd.get("entryCost"),
    maxParticipants: fd.get("maxParticipants") ? Number(fd.get("maxParticipants")) : null,
    wildcardsPerQuiz: fd.get("wildcardsPerQuiz"),
    wildcards: (["DOUBLE_TOTAL", "DOUBLE_PER_CORRECT", "TRIPLE_SURPRISE"] as const).map((type) => ({
      type,
      quantity: Number(fd.get(`wc.${type}`) || 0),
    })),
    prizes: prizesFromLists(String(fd.get("prizes") ?? ""), String(fd.get("prizeStars") ?? "")),
    scoring: { base: fd.get("base"), timeBonus: fd.get("timeBonus"), wrongPenalty: fd.get("wrongPenalty") },
    format: fd.get("format") ?? "POINTS",
    seeding: fd.get("seeding") ?? "QUALIFICATION",
    autoConfirmQualified: fd.get("autoConfirmQualified") === "on",
    thirdPlaceMatch: fd.get("thirdPlaceMatch") === "on",
    questionSource: fd.get("questionSource") ?? "NEW_FIRST",
    uniqueQuestions: fd.get("uniqueQuestions") ? Number(fd.get("uniqueQuestions")) : null,
    qualifiers: fd
      .getAll("q.source")
      .map((source, i) => ({ sourceTournamentId: String(source), fromRank: fd.getAll("q.fromRank")[i] || 1, topN: fd.getAll("q.topN")[i] }))
      .filter((q) => q.sourceTournamentId),
  };
}
