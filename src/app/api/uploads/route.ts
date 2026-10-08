import { z } from "zod";
import { authorize } from "@/server/auth/guard";
import { processAndStoreImage, type ImagePreset } from "@/server/storage/images";
import { fileUrl } from "@/server/storage";
import { assertRateLimit } from "@/server/ratelimit";
import { apiError } from "@/server/api";
import type { Action } from "@/server/auth/permissions";

const PRESET_PERMISSION: Record<ImagePreset, Action> = {
  question: "question.create",
  option: "question.create",
  cover: "category.manage",
  avatar: "play",
};

/** Subida de una imagen (multipart: file, preset). Devuelve { key, url }. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const preset = z.enum(["question", "option", "cover", "avatar"]).parse(form.get("preset"));
    const user = await authorize(PRESET_PERMISSION[preset]);
    await assertRateLimit(`upload:${user.id}`, 60, 600);
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Falta el archivo." }, { status: 400 });
    const key = await processAndStoreImage(Buffer.from(await file.arrayBuffer()), preset);
    return Response.json({ key, url: fileUrl(key) });
  } catch (err) {
    return apiError(err);
  }
}
