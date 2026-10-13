import { describe, expect, it } from "vitest";
import { isSummaryDay, weekKey, weeklySummaryBody, weeklySummaryLine } from "@/server/notifications/weekly";

const base = { name: "Historia", icon: "📜", rank: 3, ranked: 20, streak: 4, played: 2, bestScore: 1250 };

describe("resumen semanal", () => {
  it("arma una línea por categoría", () => {
    expect(weeklySummaryLine(base)).toBe("📜 Historia: puesto #3 de 20 · racha de 4 · 2 jugados, mejor 1.250 pts");
    expect(weeklySummaryLine({ ...base, icon: null, rank: null, streak: 1, played: 0, bestScore: null })).toBe(
      "Historia: sin puesto todavía · no jugaste esta semana",
    );
    expect(weeklySummaryLine({ ...base, played: 1, streak: 0 })).toContain("1 jugado, mejor");
  });

  it("une las categorías en líneas", () => {
    expect(weeklySummaryBody([base, { ...base, name: "Cine", icon: "🎬" }]).split("\n")).toHaveLength(2);
  });

  it("la clave es el lunes de la semana", () => {
    expect(weekKey(new Date("2026-10-13T12:00:00Z"))).toBe("2026-10-12");
    expect(weekKey(new Date("2026-10-18T23:00:00Z"))).toBe("2026-10-12");
    expect(weekKey(new Date("2026-10-19T00:00:00Z"))).toBe("2026-10-19");
  });
  it("sale los lunes, hora de Buenos Aires", () => {
    expect(isSummaryDay(new Date("2026-10-12T12:00:00Z"))).toBe(true); // lun 9:00
    expect(isSummaryDay(new Date("2026-10-12T02:00:00Z"))).toBe(false); // dom 23:00 en BA
    expect(isSummaryDay(new Date("2026-10-13T02:00:00Z"))).toBe(true); // lun 23:00 en BA
  });
});
