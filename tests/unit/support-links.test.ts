import { describe, expect, it } from "vitest";
import { parseMpLinks, supportOptions } from "@/server/support/links";

describe("parseMpLinks", () => {
  it("lee 'Etiqueta | link' por línea e ignora las vacías", () => {
    const r = parseMpLinks("☕ $1.000 | https://mpago.la/abc\n\n  🧉 $3.000|https://link.mercadopago.com.ar/pyr  \n");
    expect(r.errors).toEqual([]);
    expect(r.links).toEqual([
      { label: "☕ $1.000", url: "https://mpago.la/abc" },
      { label: "🧉 $3.000", url: "https://link.mercadopago.com.ar/pyr" },
    ]);
  });

  it("rechaza links que no son de Mercado Pago, sin https o sin etiqueta", () => {
    const r = parseMpLinks("Uno | https://evil.com/mpago.la\nDos | http://mpago.la/x\nhttps://mpago.la/sin-etiqueta");
    expect(r.links).toEqual([]);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]).toMatch(/^Línea 1/);
  });

  it("limita la cantidad", () => {
    const text = Array.from({ length: 8 }, (_, i) => `$${i} | https://mpago.la/${i}`).join("\n");
    const r = parseMpLinks(text);
    expect(r.links).toHaveLength(6);
    expect(r.errors).toEqual(["Como mucho 6 links."]);
  });
});

describe("supportOptions", () => {
  const base = { "support.mpEnabled": true, "support.mpLinks": "", "support.cafecitoEnabled": true, "support.cafecitoUrl": "" };
  const cafecito = "https://cafecito.app/fom78";
  const mp = "$1 | https://mpago.la/a";
  it("cada opción se muestra solo si está prendida y tiene su link", () => {
    expect(supportOptions(base).visible).toBe(false);
    expect(supportOptions({ ...base, "support.cafecitoUrl": cafecito })).toMatchObject({ visible: true, cafecito, mp: [] });
    expect(supportOptions({ ...base, "support.mpLinks": mp }).mp).toHaveLength(1);
    // Cafecito apagado y Mercado Pago prendido: solo los links.
    const onlyMp = supportOptions({
      ...base,
      "support.cafecitoEnabled": false,
      "support.cafecitoUrl": cafecito,
      "support.mpLinks": mp,
    });
    expect(onlyMp).toMatchObject({ visible: true, cafecito: null });
    expect(onlyMp.mp).toHaveLength(1);
    // Los dos apagados: no se ve nada aunque haya links.
    expect(
      supportOptions({
        ...base,
        "support.mpEnabled": false,
        "support.cafecitoEnabled": false,
        "support.cafecitoUrl": cafecito,
        "support.mpLinks": mp,
      }).visible,
    ).toBe(false);
  });
});
