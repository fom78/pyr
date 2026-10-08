import { prisma, type Db } from "@/server/db";
import {
  categoryOverridableKeys,
  defaultSettings,
  mergeSettings,
  parseSetting,
  type SettingKey,
  type Settings,
} from "./registry";

// Caché en memoria con TTL corto: web y worker son procesos distintos, así que
// un cambio hecho en uno se ve en el otro a lo sumo TTL_MS después.
const TTL_MS = 10_000;
let cache: { at: number; value: Settings } | undefined;

export async function getSettings(db: Db = prisma): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await db.appSetting.findMany();
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const value = mergeSettings(defaultSettings(), raw);
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateSettingsCache() {
  cache = undefined;
}

/** Config efectiva para una categoría: global + overrides permitidos de la categoría. */
export async function getCategorySettings(
  category: { settings: unknown; frequencyDays?: number | null },
  db: Db = prisma,
): Promise<Settings> {
  const global = await getSettings(db);
  const overrides = (category.settings ?? {}) as Record<string, unknown>;
  const merged = mergeSettings(global, overrides, categoryOverridableKeys);
  if (category.frequencyDays) merged["quiz.frequencyDays"] = category.frequencyDays;
  return merged;
}

export async function setSetting<K extends SettingKey>(key: K, value: unknown, actorId: string, db: Db = prisma) {
  const parsed = parseSetting(key, value);
  await db.appSetting.upsert({
    where: { key },
    create: { key, value: parsed as never, updatedById: actorId },
    update: { value: parsed as never, updatedById: actorId },
  });
  invalidateSettingsCache();
  return parsed;
}
