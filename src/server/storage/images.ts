import sharp, { type Metadata as SharpMetadata } from "sharp";
import { UserError } from "@/server/errors";
import { newKey, storage } from "./index";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);

export type ImagePreset = "question" | "option" | "avatar" | "cover";

const PRESETS: Record<ImagePreset, { width: number; height?: number; fit: "inside" | "cover"; quality: number }> = {
  question: { width: 1280, fit: "inside", quality: 80 },
  option: { width: 480, fit: "inside", quality: 80 },
  avatar: { width: 256, height: 256, fit: "cover", quality: 80 },
  cover: { width: 1200, height: 630, fit: "cover", quality: 80 },
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
  return key;
}
