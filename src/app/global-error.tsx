"use client";

// Último recurso si falla el layout raíz: HTML mínimo sin dependencias.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-AR">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 56, fontWeight: 900, margin: 0 }}>500</p>
          <h1>Algo salió mal</h1>
          <p>Estamos teniendo un problema. Probá de nuevo en unos segundos.</p>
          <button onClick={reset} style={{ padding: "10px 18px", fontSize: 16, cursor: "pointer" }}>
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
