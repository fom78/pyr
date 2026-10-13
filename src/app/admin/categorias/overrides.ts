import { categoryOverridableKeys, settingsRegistry, type Settings } from "@/server/config/registry";
import type { OverrideField } from "./category-form";

export function overrideFields(global: Settings): OverrideField[] {
  return categoryOverridableKeys.map((k) => {
      const d = settingsRegistry[k] as { label: string; help?: string; unit?: string; default: unknown };
      const kind = typeof d.default === "boolean" ? ("boolean" as const) : ("number" as const);
      return { key: k, label: d.label, help: d.help, unit: d.unit, kind, globalValue: global[k] as number | boolean };
    });
}
