import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-heading font-black tracking-tight", className)}>
      Py<span className="text-primary">R</span>
      <span className="sr-only"> — Preguntas y Respuestas</span>
    </span>
  );
}
