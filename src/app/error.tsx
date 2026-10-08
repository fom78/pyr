"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatusPage } from "@/components/layout/status-page";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusPage
      code="500"
      title="Algo salió mal"
      description={`Tuvimos un problema al cargar esta pantalla. Probá de nuevo en unos segundos.${error.digest ? ` (código ${error.digest})` : ""}`}
      action={<Button onClick={reset}>Reintentar</Button>}
    />
  );
}
