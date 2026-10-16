import { Heart, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Vidas como corazones: llenos = en uso, vacíos = libres, candado = por desbloquear (hasta el tope). */
export function LivesHearts({ used, free, locked, className }: { used: number; free: number; locked: number; className?: string }) {
  const label = `${used} ${used === 1 ? "vida en uso" : "vidas en uso"}, ${free} ${free === 1 ? "libre" : "libres"}${
    locked ? `, ${locked} por desbloquear` : ""
  }`;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={label} title={label}>
      {Array.from({ length: used }, (_, i) => (
        <Heart key={`u${i}`} className="size-4 fill-destructive text-destructive" aria-hidden />
      ))}
      {Array.from({ length: free }, (_, i) => (
        <Heart key={`f${i}`} className="size-4 text-muted-foreground" aria-hidden />
      ))}
      {Array.from({ length: locked }, (_, i) => (
        <Lock key={`l${i}`} className="size-3.5 text-muted-foreground/60" aria-hidden />
      ))}
    </span>
  );
}
