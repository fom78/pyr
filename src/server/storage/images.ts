import sharp, { type Metadata as SharpMetadata } from "sharp";
import { UserError } from "@/server/errors";
import { newKey, smallVariantKey, storage } from "./index";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);

export type ImagePreset = "question" | "option" | "avatar" | "cover" | "ticket";

const PRESETS: Record<ImagePreset, { width: number; height?: number; fit: "inside" | "cover"; quality: number }> = {
  question: { width: 1280, fit: "inside", quality: 80 },
  option: { width: 480, fit: "inside", quality: 80 },
  avatar: { width: 256, height: 256, fit: "cover", quality: 80 },
  cover: { width: 1200, height: 630, fit: "cover", quality: 80 },
  // Captura de pantalla de un ticket de soporte: tiene que leerse el texto.
  ticket: { width: 1600, fit: "inside", quality: 82 },
};

/** Redimensiona, comprime a WebP, quita metadatos (EXIF/GPS) y guarda. Devuelve el key. */
export async function processAndStoreImage(input: Buffer, preset: ImagePreset, folder: string = preset): Promise<string> {
  if (input.byteLength > MAX_INPUT_BYTES) throw new UserError("La imagen supera los 8 MB.");
  let meta: SharpMetadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new UserError("El archivo no es una imagen válida.");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw new UserError("Formato de imagen no soportado (usá JPG, PNG o WebP).");
  const p = PRESETS[preset];
  const out = await sharp(input, { animated: false })
    .rotate() // respeta orientación EXIF
    .resize({ width: p.width, height: p.height, fit: p.fit, withoutEnlargement: true })
    .webp({ quality: p.quality })
    .toBuffer();
  const key = newKey(folder, "webp");
  await storage().put(key, out, "image/webp");
  if (preset === "cover") await storeCoverSmall(key, out);
  return key;
}

/** Variante chica de una portada (600×315), para tarjetas y celulares. */
const COVER_SMALL = { width: 600, height: 315, quality: 78 };

async function storeCoverSmall(key: string, cover: Buffer) {
  const small = await sharp(cover)
    .resize({ width: COVER_SMALL.width, height: COVER_SMALL.height, fit: "cover", withoutEnlargement: true })
    .webp({ quality: COVER_SMALL.quality })
    .toBuffer();
  await storage().put(smallVariantKey(key), small, "image/webp");
}

/**
 * Genera la variante chica de las portadas que no la tienen (subidas antes de que existiera).
 * Idempotente; la corre el worker.
 */
export async function ensureCoverVariants(keys: string[]) {
  let created = 0;
  for (const key of keys) {
    if (/^https?:\/\//.test(key) || !key.endsWith(".webp")) continue;
    if (await storage().get(smallVariantKey(key))) continue;
    const file = await storage().get(key);
    if (!file) continue;
    await storeCoverSmall(key, file.body);
    created++;
  }
  return created;
}
