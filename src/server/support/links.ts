/**
 * Links de colaboración (puro). Los de Mercado Pago son "links de pago" que el dueño crea en su cuenta
 * (uno por monto); se cargan en la config, uno por línea: `Etiqueta | https://mpago.la/xxxx`.
 */

const MP_HOSTS = ["mpago.la", "mpago.li", "link.mercadopago.com.ar", "mercadopago.com.ar", "www.mercadopago.com.ar"];
export const MAX_MP_LINKS = 6;

export type MpLink = { label: string; url: string };

function isMpUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && MP_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/** Lee las líneas `Etiqueta | URL`. Devuelve los links válidos y los errores (con número de línea). */
export function parseMpLinks(text: string): { links: MpLink[]; errors: string[] } {
  const links: MpLink[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const sep = line.lastIndexOf("|");
    const label = sep >= 0 ? line.slice(0, sep).trim() : "";
    const url = (sep >= 0 ? line.slice(sep + 1) : line).trim();
    if (!label) errors.push(`Línea ${i + 1}: falta la etiqueta (por ejemplo "☕ $1.000 | ${url || "https://mpago.la/…"}").`);
    else if (label.length > 40) errors.push(`Línea ${i + 1}: la etiqueta es muy larga (máximo 40 caracteres).`);
    else if (!isMpUrl(url)) errors.push(`Línea ${i + 1}: tiene que ser un link de pago de Mercado Pago (https://mpago.la/…).`);
    else links.push({ label, url });
  });
  if (links.length > MAX_MP_LINKS) errors.push(`Como mucho ${MAX_MP_LINKS} links.`);
  return { links: links.slice(0, MAX_MP_LINKS), errors };
}

type SupportSettings = {
  "support.mpEnabled": boolean;
  "support.mpLinks": string;
  "support.cafecitoEnabled": boolean;
  "support.cafecitoUrl": string;
};

/**
 * Qué mostrar en "Colaborar": cada opción se prende por separado y necesita su link. Si no queda
 * ninguna, no se muestra nada (ni menú, ni página, ni avisos).
 */
export function supportOptions(s: SupportSettings) {
  const mp = s["support.mpEnabled"] ? parseMpLinks(s["support.mpLinks"]).links : [];
  const cafecito = (s["support.cafecitoEnabled"] && s["support.cafecitoUrl"]) || null;
  return { visible: mp.length > 0 || Boolean(cafecito), mp, cafecito };
}
