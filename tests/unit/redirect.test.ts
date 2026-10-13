import { describe, expect, it } from "vitest";
import { relativeRedirect } from "@/lib/redirect";

describe("relativeRedirect", () => {
  it("manda una Location relativa (el navegador la resuelve contra su dominio, no el host interno)", () => {
    const res = relativeRedirect("/admin/cuestionarios/nuevo?ref=c:x&turno=2026-10-14T23:00:00.000Z", 307, { "Cache-Control": "no-store" });
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("/admin/cuestionarios/nuevo?ref=c:x&turno=2026-10-14T23:00:00.000Z");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("solo rutas internas", () => {
    expect(() => relativeRedirect("https://evil.com")).toThrow();
    expect(() => relativeRedirect("//evil.com")).toThrow();
  });
});
