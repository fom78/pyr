"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CurrentQuestion } from "@/server/game/engine";

type State = CurrentQuestion | { status: "FINISHED"; attemptId: string };

const LETTERS = ["A", "B", "C", "D", "E"];
const WILDCARD_LABEL: Record<string, string> = {
  DOUBLE_TOTAL: "🃏 Doble total",
  DOUBLE_PER_CORRECT: "🃏 Doble por acierto",
  TRIPLE_SURPRISE: "🃏 Triple sorpresa",
};

/**
 * Pantalla de juego. El reloj se dibuja con la hora del servidor (offset calculado en cada respuesta);
 * el servidor es quien decide si una respuesta llegó a tiempo.
 */
export function GamePlayer({ initial, title, wildcard }: { initial: CurrentQuestion; title: string; wildcard: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState<CurrentQuestion>(initial);
  const [offset, setOffset] = useState(() => new Date(initial.serverNow).getTime() - Date.now());
  const [remaining, setRemaining] = useState(() => new Date(initial.deadlineAt).getTime() - new Date(initial.serverNow).getTime());
  const [sending, setSending] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const sentFor = useRef<number>(-1);

  const apply = useCallback(
    (next: State) => {
      if (next.status === "FINISHED") {
        router.replace(`/resultados/${next.attemptId}`);
        router.refresh(); // actualiza el layout (saldo de créditos ganado al terminar)
        return;
      }
      setOffset(new Date(next.serverNow).getTime() - Date.now());
      setQ(next);
      setSending(null);
    },
    [router],
  );

  const send = useCallback(
    async (optionId: string | null) => {
      if (sentFor.current === q.index) return;
      sentFor.current = q.index;
      setSending(optionId ?? "timeout");
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch(`/api/play/${q.attemptId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ index: q.index, optionId }),
          });
          setOffline(false);
          if (res.status === 409) {
            // La pregunta ya no está en juego (venció o se respondió en otra pestaña): pedir el estado actual.
            const cur = await fetch(`/api/play/${q.attemptId}`, { cache: "no-store" });
            apply(await cur.json());
            return;
          }
          if (!res.ok) throw new Error(String(res.status));
          apply(await res.json());
          return;
        } catch {
          setOffline(true);
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      // Sin conexión: recargar estado cuando vuelva (el servidor sigue contando el tiempo).
      sentFor.current = -1;
      setSending(null);
    },
    [q, apply],
  );

  // Reloj
  useEffect(() => {
    const deadline = new Date(q.deadlineAt).getTime();
    const tick = () => {
      const left = deadline - (Date.now() + offset);
      setRemaining(left);
      if (left <= 0) send(null);
    };
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
  }, [q, offset, send]);

  // Atajos de teclado 1-5 / A-E
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sending) return;
      const i = "12345".indexOf(e.key) >= 0 ? "12345".indexOf(e.key) : "abcde".indexOf(e.key.toLowerCase());
      if (i >= 0 && q.options[i]) send(q.options[i].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, sending, send]);

  const pct = Math.max(0, Math.min(100, (remaining / q.limitMs) * 100));
  const secs = Math.max(0, Math.ceil(remaining / 1000));
  const urgent = pct < 25;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-2xl flex-col gap-4 pb-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="truncate">{title}</span>
        <span className="shrink-0 font-medium tabular-nums">
          {q.index + 1} / {q.total}
        </span>
      </div>
      {wildcard && <div className="w-fit rounded-full bg-warning/20 px-3 py-0.5 text-xs font-medium">{WILDCARD_LABEL[wildcard] ?? wildcard} activo</div>}

      <div className="grid gap-1" role="timer" aria-live="off" aria-label={`Quedan ${secs} segundos`}>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-[width] duration-100 ease-linear", urgent ? "bg-destructive" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn("text-right text-sm font-semibold tabular-nums", urgent && "text-destructive")}>{secs} s</span>
      </div>

      {offline && (
        <p role="status" className="flex items-center gap-2 rounded-md bg-warning/20 px-3 py-2 text-sm">
          <WifiOff className="size-4" /> Problemas de conexión… reintentando. El reloj sigue corriendo.
        </p>
      )}

      <div className="grid gap-3">
        {q.question.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.question.imageUrl} alt="Imagen de la pregunta" className="mx-auto max-h-[35dvh] w-auto rounded-lg border object-contain" />
        )}
        {q.question.text && <h1 className="text-xl font-bold text-balance sm:text-2xl">{q.question.text}</h1>}
      </div>

      <div className="mt-auto grid gap-2 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            disabled={Boolean(sending)}
            onClick={() => send(o.id)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border-2 bg-card p-3 text-left text-base font-medium transition-colors",
              "hover:border-primary hover:bg-primary/5 focus-visible:border-primary focus-visible:outline-none disabled:cursor-default",
              sending === o.id && "border-primary bg-primary/10",
              sending && sending !== o.id && "opacity-50",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
              {sending === o.id ? <Loader2 className="size-4 animate-spin" /> : LETTERS[i]}
            </span>
            {o.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.imageUrl} alt="" className="size-14 rounded-md object-cover" />
            )}
            <span className="text-pretty">{o.text}</span>
          </button>
        ))}
      </div>
      {sending === "timeout" && <p className="text-center text-sm text-muted-foreground">¡Se acabó el tiempo! Pasando a la siguiente…</p>}
    </div>
  );
}
