/** Título de un borrador automático. Variables: {categoria}, {fecha}, {n}. */
export function renderTitle(template: string, vars: { categoria: string; fecha: string; n: number }) {
  const title = template
    .replaceAll("{categoria}", vars.categoria)
    .replaceAll("{fecha}", vars.fecha)
    .replaceAll("{n}", String(vars.n))
    .trim();
  return (title.length >= 2 ? title : `${vars.categoria} · ${vars.fecha}`).slice(0, 120);
}
