import { randomUUID } from "node:crypto";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

/**
 * Almacenamiento de archivos detrás de una interfaz. El resto del código solo conoce "keys"
 * (ej. "questions/2026/10/abc.webp"); cambiar de disco local a S3/MinIO/R2 es solo config.
 */
export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** URL pública para mostrar el archivo. */
  url(key: string): string;
}

let instance: StorageAdapter | undefined;

export function storage(): StorageAdapter {
  if (!instance) {
    instance =
      process.env.STORAGE_DRIVER === "s3"
        ? new S3Storage({
            endpoint: process.env.S3_ENDPOINT || undefined,
            region: process.env.S3_REGION || "auto",
            bucket: process.env.S3_BUCKET!,
            accessKeyId: process.env.S3_ACCESS_KEY_ID!,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
            publicUrl: process.env.S3_PUBLIC_URL || undefined,
          })
        : new LocalStorage(process.env.STORAGE_LOCAL_DIR || "./storage/uploads");
  }
  return instance;
}

/** URL para un key de storage; deja pasar URLs absolutas (ej. avatar de Google). */
export function fileUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  return storage().url(key);
}

export function newKey(folder: string, ext: string) {
  const d = new Date();
  const month = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${folder}/${month}/${randomUUID()}.${ext}`;
}

/** Keys válidos: sin "..", sin barra inicial, caracteres seguros. */
export function isSafeKey(key: string) {
  return /^[a-z0-9][a-z0-9/_.-]*$/i.test(key) && !key.includes("..");
}
