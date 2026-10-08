import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/server/config/registry";
import { rulesFromSettings } from "@/server/rules/view";

describe("reglas generadas desde la configuración", () => {
  it("refleja los valores actuales y calcula el ejemplo con los pesos reales", () => {
    const s = { ...defaultSettings(), "ranking.bestK": 7, "scoring.base": 200, "scoring.timeBonus": 100, "quiz.timeLimitSec": 20 };
    const r = rulesFromSettings(s);
    expect(r.bestK).toBe(7);
    expect(r.scoringExample.fast).toBe(5);
    expect(r.scoringExample.fastPoints).toBe(200 + 75);
    expect(r.scoringExample.slowPoints).toBe(200 + 25);
    expect(r.scoringExample.wrongPoints).toBe(0);
  });
});
