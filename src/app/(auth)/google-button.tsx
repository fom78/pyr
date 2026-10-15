"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Solo rutas internas (evita usar el ingreso como redirección abierta). */
function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** Botón principal de ingreso: si es la primera vez crea la cuenta y lleva a la bienvenida. */
export function GoogleButton({ label = "Continuar con Google", next }: { label?: string; next?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const errorTo = next ? `/ingresar?next=${encodeURIComponent(safeNext(next))}` : "/ingresar";
        const { error } = await authClient.signIn.social({
          provider: "google",
          callbackURL: safeNext(next),
          newUserCallbackURL: "/bienvenida",
          errorCallbackURL: errorTo,
        });
        if (error) setPending(false);
      }}
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.3 6.6 2.3 12s4.3 9.8 9.7 9.8c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
      )}
      {label}
    </Button>
  );
}

/** Separador "o con usuario y contraseña". */
export function OrDivider({ label = "o con usuario y contraseña" }: { label?: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-xs">
      <span className="bg-border h-px flex-1" /> {label} <span className="bg-border h-px flex-1" />
    </div>
  );
}
