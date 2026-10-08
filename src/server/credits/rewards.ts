import { prisma, type Db } from "@/server/db";
import { getSettings } from "@/server/config/service";
import { postTransaction } from "./service";

export async function grantSignupBonus(userId: string, db: Db = prisma) {
  const s = await getSettings(db);
  if (s["credits.signupBonus"] <= 0) return null;
  return postTransaction(
    {
      userId,
      amount: s["credits.signupBonus"],
      type: "SIGNUP_BONUS",
      reason: "Bono de bienvenida",
      idempotencyKey: `signup:${userId}`,
    },
    db,
  );
}
