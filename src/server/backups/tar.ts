import { createReadStream, createWriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

/**
 * Empaquetador .tar.gz mínimo (formato ustar) para las imágenes subidas, sin depender del binario
 * `tar` (no está en Windows) ni de una dependencia nueva. Solo archivos regulares y carpetas.
 */
const BLOCK = 512;

function writeString(buf: Buffer, value: string, offset: number, length: number) {
  buf.write(value, offset, Math.min(Buffer.byteLength(value), length), "utf8");
}

function writeOctal(buf: Buffer, value: number, offset: number, length: number) {
  // length-1 dígitos octales + NUL
  writeString(buf, value.toString(8).padStart(length - 1, "0"), offset, length - 1);
}

/** Separa una ruta larga en prefix (≤155) + name (≤100), como pide ustar. */
export function splitTarPath(p: string): { name: string; prefix: string } {
  if (Buffer.byteLength(p) <= 100) return { name: p, prefix: "" };
  const parts = p.split("/");
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = parts.slice(0, i).join("/");
    const name = parts.slice(i).join("/");
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  throw new Error(`Ruta demasiado larga para tar: ${p}`);
}

export function tarHeader(entry: { path: string; size: number; mtime: Date; dir?: boolean }) {
  const buf = Buffer.alloc(BLOCK, 0);
  const { name, prefix } = splitTarPath(entry.dir && !entry.path.endsWith("/") ? `${entry.path}/` : entry.path);
  writeString(buf, name, 0, 100);
  writeOctal(buf, entry.dir ? 0o755 : 0o644, 100, 8);
  writeOctal(buf, 0, 108, 8); // uid
  writeOctal(buf, 0, 116, 8); // gid
  writeOctal(buf, entry.dir ? 0 : entry.size, 124, 12);
  writeOctal(buf, Math.floor(entry.mtime.getTime() / 1000), 136, 12);
  buf.fill(0x20, 148, 156); // checksum como espacios para calcularlo
  buf.write(entry.dir ? "5" : "0", 156, "ascii");
  buf.write("ustar\0", 257, "ascii");
  buf.write("00", 263, "ascii");
  writeString(buf, prefix, 345, 155);
  let sum = 0;
  for (const b of buf) sum += b;
  writeString(buf, `${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return buf;
}

async function* walk(root: string, rel = ""): AsyncGenerator<{ rel: string; abs: string; dir: boolean }> {
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    const abs = path.join(root, r);
    if (e.isDirectory()) {
      yield { rel: r, abs, dir: true };
      yield* walk(root, r);
    } else if (e.isFile()) {
      yield { rel: r, abs, dir: false };
    }
  }
}

async function* tarStream(root: string): AsyncGenerator<Buffer> {
  for await (const e of walk(root)) {
    const st = await stat(e.abs);
    yield tarHeader({ path: e.rel, size: st.size, mtime: st.mtime, dir: e.dir });
    if (e.dir) continue;
    let written = 0;
    for await (const chunk of createReadStream(e.abs)) {
      written += (chunk as Buffer).length;
      yield chunk as Buffer;
    }
    if (written !== st.size) throw new Error(`El archivo cambió mientras se empaquetaba: ${e.rel}`);
    const pad = (BLOCK - (st.size % BLOCK)) % BLOCK;
    if (pad) yield Buffer.alloc(pad, 0);
  }
  yield Buffer.alloc(BLOCK * 2, 0); // fin del archivo
}

/** Escribe `root` (su contenido, rutas relativas) en `outFile` como .tar.gz. */
export async function writeTarGz(root: string, outFile: string) {
  await pipeline(Readable.from(tarStream(root)), createGzip({ level: 6 }), createWriteStream(outFile));
}
