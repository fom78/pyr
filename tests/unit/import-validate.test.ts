import { describe, expect, it } from "vitest";
import { flagInFileDuplicates, headerToKey, validateRow, type RawRow } from "@/server/import/validate";

const ctx = {
  categories: [
    { id: "c1", name: "Fútbol", slug: "futbol" },
    { id: "c2", name: "Cine", slug: "cine" },
  ],
  zipFiles: new Set(["foto.jpg"]),
};

const ok: RawRow = {
  categoria: "futbol",
  pregunta: "¿Quién ganó el Mundial 2022?",
  opcion_1: "Francia",
  opcion_2: "Argentina",
  opcion_3: "Brasil",
  opcion_4: "Croacia",
  correcta: "2",
};

describe("headerToKey", () => {
  it("reconoce encabezados con acentos y variantes", () => {
    expect(headerToKey("Categoría")).toBe("categoria");
    expect(headerToKey("Opción 3")).toBe("opcion_3");
    expect(headerToKey("opcion5")).toBe("opcion_5");
    expect(headerToKey("Explicación")).toBe("explicacion");
    expect(headerToKey("cualquier cosa")).toBeUndefined();
  });
});

describe("validateRow", () => {
  it("acepta una fila correcta (categoría por slug o nombre sin acento)", () => {
    const r = validateRow(2, ok, ctx);
    expect(r.errors).toEqual([]);
    expect(r.input?.categoryIds).toEqual(["c1"]);
    expect(r.input?.correctIndex).toBe(1);
    expect(validateRow(2, { ...ok, categoria: "futbol, CINE" }, ctx).input?.categoryIds).toEqual(["c1", "c2"]);
  });

  it("informa la fila cuando falta la opción correcta", () => {
    const r = validateRow(12, { ...ok, correcta: "" }, ctx);
    expect(r.errors).toContain("Fila 12: falta la opción correcta.");
  });

  it("rechaza categoría inexistente", () => {
    expect(validateRow(3, { ...ok, categoria: "Historia" }, ctx).errors[0]).toMatch(/no existe/);
  });

  it("exige 4 o 5 opciones", () => {
    expect(validateRow(4, { ...ok, opcion_4: "" }, ctx).errors[0]).toMatch(/3 opciones/);
  });

  it("detecta que la correcta apunta a una opción vacía", () => {
    expect(validateRow(5, { ...ok, correcta: "5" }, ctx).errors[0]).toMatch(/está vacía/);
  });

  it("mapea la correcta aunque haya huecos entre opciones", () => {
    const r = validateRow(6, { ...ok, opcion_2: "", opcion_5: "Uruguay", correcta: "5" }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.input?.options.map((o) => o.text)).toEqual(["Francia", "Brasil", "Croacia", "Uruguay"]);
    expect(r.input?.correctIndex).toBe(3);
  });

  it("valida imágenes del zip o URL", () => {
    expect(validateRow(7, { ...ok, imagen: "fotos/FOTO.jpg" }, ctx).imageRef).toEqual({ kind: "zip", value: "foto.jpg" });
    expect(validateRow(7, { ...ok, imagen: "https://x.com/a.png" }, ctx).imageRef?.kind).toBe("url");
    expect(validateRow(7, { ...ok, imagen: "otra.png" }, ctx).errors[0]).toMatch(/no está en el .zip/);
  });

  it("rechaza dificultad fuera de rango y opciones repetidas", () => {
    expect(validateRow(8, { ...ok, dificultad: "9" }, ctx).errors[0]).toMatch(/dificultad/);
    expect(validateRow(9, { ...ok, opcion_3: "francia" }, ctx).errors[0]).toMatch(/repetidas/);
  });
});

describe("flagInFileDuplicates", () => {
  it("advierte preguntas repetidas en el mismo archivo", () => {
    const rows = flagInFileDuplicates([validateRow(2, ok, ctx), validateRow(3, { ...ok, pregunta: "quien gano el mundial 2022" }, ctx)]);
    expect(rows[1].warnings[0]).toMatch(/igual a la fila 2/);
  });
});
