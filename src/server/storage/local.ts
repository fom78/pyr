import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter } from "./index";

const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/** Guarda en un directorio local (volumen de Docker en producción). Se sirve por /api/files/<key>. */
export class LocalStorage implements StorageAdapter {
  private root: string;

  constructor(dir: string) {
    this.root = path.resolve(dir);
  }

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Key de archivo inválido");
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string) {
    try {
      const body = await readFile(this.resolve(key));
      return { body, contentType: TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  url(key: string) {
    return `/api/files/${key}`;
  }
}
