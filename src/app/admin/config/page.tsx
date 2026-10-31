import { requirePermission } from "@/server/auth/session";
import { getSettings } from "@/server/config/service";
import { settingsRegistry, settingKeys, type SettingGroup } from "@/server/config/registry";
import { PageHeader } from "@/components/common";
import { ConfigForm, type ConfigField } from "./config-form";

export const metadata = { title: "Configuración" };

/** Formulario generado a partir del registro de configuración: agregar una key al registro la muestra acá. */
export default async function ConfigPage() {
  await requirePermission("settings.manage");
  const s = await getSettings();
  const groups = new Map<SettingGroup, ConfigField[]>();
  for (const key of settingKeys) {
    const def = settingsRegistry[key] as {
      label: string;
      help?: string;
      unit?: string;
      group: SettingGroup;
      default: unknown;
      categoryOverride?: boolean;
      multiline?: boolean;
      schema: { options?: readonly unknown[] };
    };
    const value = s[key];
    const kind =
      typeof def.default === "boolean"
        ? "boolean"
        : typeof def.default === "number"
          ? "number"
          : // Solo z.enum: un z.union también tiene `options`, pero son schemas.
            def.schema.options?.every((o) => typeof o === "string")
            ? "enum"
            : def.multiline
              ? "textarea"
              : "text";
    const options = kind === "enum" ? (def.schema.options as string[]) : undefined;
    const list = groups.get(def.group) ?? [];
    list.push({
      key,
      label: def.label,
      help: def.help,
      unit: def.unit,
      kind,
      options,
      value: value as string | number | boolean,
      default: def.default as string | number | boolean,
      categoryOverride: Boolean(def.categoryOverride),
    });
    groups.set(def.group, list);
  }
  return (
    <>
      <PageHeader
        title="Configuración"
        description="Parámetros de negocio. Los marcados con “por categoría” se pueden sobrescribir en cada categoría. Las reglas visibles para los jugadores se actualizan solas."
      />
      <ConfigForm groups={[...groups.entries()].map(([name, fields]) => ({ name, fields }))} />
    </>
  );
}
