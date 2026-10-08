import { categoryOverridableKeys, settingsRegistry, type Settings } from "@/server/config/registry";
import type { OverrideField } from "./category-form";

export function overrideFields(global: Settings): OverrideField[] {
  return categoryOverridableKeys
    .filter((k) => k !== "quiz.frequencyDays") // tiene su propio campo
    .map((k) => {
      const d = settingsRegistry[k] as { label: string; help?: string; unit?: string };
      return { key: k, label: d.label, help: d.help, unit: d.unit, globalValue: global[k] as number };
    });
}
