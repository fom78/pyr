/** Normaliza texto para búsqueda y detección de duplicados: minúsculas, sin acentos ni signos. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(s: string): string {
  return normalizeText(s).replace(/ñ/g, "n").replace(/\s+/g, "-").slice(0, 60) || "item";
}
