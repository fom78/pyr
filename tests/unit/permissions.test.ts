import { describe, expect, it } from "vitest";
import { can } from "@/server/auth/permissions";

const admin = { id: "1", role: "ADMIN" as const };
const mod = { id: "2", role: "MOD" as const };
const user = { id: "3", role: "USER" as const };

describe("can()", () => {
  it("admin puede todo", () => {
    expect(can(admin, "settings.manage")).toBe(true);
    expect(can(admin, "credits.adjust")).toBe(true);
  });
  it("mod gestiona contenido pero no config, roles ni créditos", () => {
    expect(can(mod, "question.review")).toBe(true);
    expect(can(mod, "tournament.manage")).toBe(true);
    expect(can(mod, "settings.manage")).toBe(false);
    expect(can(mod, "user.setRole")).toBe(false);
    expect(can(mod, "credits.adjust")).toBe(false);
    expect(can(mod, "question.autoApprove")).toBe(false);
  });
  it("mod banea solo si el admin lo habilita", () => {
    expect(can(mod, "user.ban")).toBe(false);
    expect(can(mod, "user.ban", { canBan: true })).toBe(true);
  });
  it("usuario solo juega", () => {
    expect(can(user, "play")).toBe(true);
    expect(can(user, "admin.access")).toBe(false);
  });
  it("baneado no puede nada", () => {
    expect(can({ ...user, banned: true }, "play")).toBe(false);
    expect(can({ ...admin, banned: true }, "play")).toBe(false);
  });
  it("sin sesión no puede nada", () => {
    expect(can(null, "play")).toBe(false);
  });
});
