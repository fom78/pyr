import { describe, expect, it } from "vitest";
import { checkJoin, effectiveStatus, leaveDates, livesUsed, type MembershipLike } from "@/server/league/lives";

const now = new Date("2026-03-10T12:00:00Z");
const day = 86_400_000;
const m = (categoryId: string, status: MembershipLike["status"], extra: Partial<MembershipLike> = {}): MembershipLike => ({
  categoryId,
  status,
  lifeReleasesAt: null,
  rejoinAllowedAt: null,
  ...extra,
});

describe("vidas", () => {
  it("una inscripción en desvinculación sigue ocupando vida hasta su fecha", () => {
    const leaving = m("cine", "LEAVING", { lifeReleasesAt: new Date(now.getTime() + day) });
    expect(livesUsed([m("futbol", "ACTIVE"), leaving], now)).toBe(2);
    expect(effectiveStatus(leaving, new Date(now.getTime() + 2 * day))).toBe("LEFT");
    expect(livesUsed([m("futbol", "ACTIVE"), leaving], new Date(now.getTime() + 2 * day))).toBe(1);
  });

  it("no permite superar el máximo de vidas", () => {
    const ms = [m("a", "ACTIVE"), m("b", "ACTIVE"), m("c", "ACTIVE")];
    expect(checkJoin(ms, "d", 3, now)).toMatchObject({ ok: false, reason: "NO_LIVES" });
  });

  it("informa vidas restantes al inscribirse", () => {
    expect(checkJoin([m("a", "ACTIVE")], "b", 3, now)).toEqual({ ok: true, livesLeftAfter: 1 });
  });

  it("no puede inscribirse dos veces ni durante la desvinculación", () => {
    expect(checkJoin([m("a", "ACTIVE")], "a", 3, now)).toMatchObject({ ok: false, reason: "ALREADY_MEMBER" });
    const leaving = m("a", "LEAVING", { lifeReleasesAt: new Date(now.getTime() + day) });
    expect(checkJoin([leaving], "a", 3, now)).toMatchObject({ ok: false, reason: "LEAVING" });
  });

  it("bloquea volver a la misma categoría hasta rejoinAllowedAt", () => {
    const left = m("a", "LEFT", { rejoinAllowedAt: new Date(now.getTime() + day) });
    expect(checkJoin([left], "a", 3, now)).toMatchObject({ ok: false, reason: "REJOIN_BLOCKED" });
    expect(checkJoin([left], "b", 3, now).ok).toBe(true);
    expect(checkJoin([left], "a", 3, new Date(now.getTime() + 2 * day)).ok).toBe(true);
  });

  it("calcula fechas de salida (el bloqueo nunca es menor al período de desvinculación)", () => {
    const d = leaveDates(now, 7, 14);
    expect(d.lifeReleasesAt.getTime() - now.getTime()).toBe(7 * day);
    expect(d.rejoinAllowedAt.getTime() - now.getTime()).toBe(14 * day);
    expect(leaveDates(now, 7, 3).rejoinAllowedAt.getTime() - now.getTime()).toBe(7 * day);
  });
});
