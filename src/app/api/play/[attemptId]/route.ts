import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrent, submitAnswer } from "@/server/game/engine";
import { getSettings } from "@/server/config/service";
import { assertRateLimit } from "@/server/ratelimit";
import { apiError } from "@/server/api";
import { UserError } from "@/server/errors";

type Ctx = { params: Promise<{ attemptId: string }> };

async function requirePlayer() {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Tu sesión expiró.", "UNAUTHENTICATED", 401);
  return user;
}

const noStore = { "Cache-Control": "no-store" };

/** Estado actual del intento: la pregunta en curso (sin la respuesta correcta) o FINISHED. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requirePlayer();
    const { attemptId } = await ctx.params;
    return Response.json(await getCurrent(attemptId, user.id), { headers: noStore });
  } catch (err) {
    return apiError(err);
  }
}

const answerSchema = z.object({ index: z.number().int().min(0), optionId: z.string().min(1).nullable() });

/** Envía la respuesta de la pregunta `index`. optionId null = sin responder (tiempo agotado). */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requirePlayer();
    const s = await getSettings();
    await assertRateLimit(`answer:${user.id}`, s["game.answersPerMinute"], 60);
    const { attemptId } = await ctx.params;
    const body = answerSchema.parse(await req.json());
    const result = await submitAnswer(attemptId, user.id, body);
    const next = result.finished ? { status: "FINISHED", attemptId } : await getCurrent(attemptId, user.id);
    return Response.json(next, { headers: noStore });
  } catch (err) {
    return apiError(err);
  }
}
