/**
 * Redirección con `Location` relativa. Detrás de Caddy el servidor standalone ve su propia
 * dirección (`req.url` = http://0.0.0.0:3000/…), así que armar la URL absoluta con `req.url`
 * manda al usuario a un host inválido. Una ruta relativa la resuelve el navegador contra el
 * dominio en el que ya está. Solo para rutas internas.
 */
export function relativeRedirect(path: string, status = 307, headers: Record<string, string> = {}) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error(`Redirección no interna: ${path}`);
  return new Response(null, { status, headers: { Location: path, ...headers } });
}
