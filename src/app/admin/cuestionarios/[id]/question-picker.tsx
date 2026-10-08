"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/forms/native-select";
import { pickerSearchAction, saveQuizQuestionsAction } from "../actions";

type Selected = { id: string; text: string | null; status: string; difficulty: number };
type Result = Awaited<ReturnType<typeof pickerSearchAction>>;

export function QuestionPicker({
  quizId,
  categoryFilterId,
  selected: initial,
}: {
  quizId: string;
  categoryFilterId?: string;
  selected: Selected[];
}) {
  const [selected, setSelected] = useState(initial);
  const [q, setQ] = useState("");
  const [unused, setUnused] = useState("");
  const [onlyCategory, setOnlyCategory] = useState(Boolean(categoryFilterId));
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const dirty = JSON.stringify(selected.map((s) => s.id)) !== JSON.stringify(initial.map((s) => s.id));

  const search = (p = 1) =>
    startSearch(async () => {
      setPage(p);
      setResult(await pickerSearchAction({ q, unused, categoryId: onlyCategory ? categoryFilterId : undefined, page: p }));
    });

  useEffect(() => {
    search(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (i: number, d: -1 | 1) =>
    setSelected((s) => {
      const a = [...s];
      [a[i], a[i + d]] = [a[i + d], a[i]];
      return a;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preguntas ({selected.length})</CardTitle>
        <CardDescription>Solo se pueden publicar preguntas aprobadas. El orden importa si el cuestionario no mezcla preguntas.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {selected.length > 0 && (
          <ol className="grid gap-1.5">
            {selected.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex-1 text-pretty">
                  {s.text ?? <em>(imagen)</em>} {s.status !== "APPROVED" && <Badge variant="destructive">sin aprobar</Badge>}
                </span>
                <Button type="button" size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                  <ArrowUp />
                </Button>
                <Button type="button" size="icon" variant="ghost" disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">
                  <ArrowDown />
                </Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => setSelected((x) => x.filter((y) => y.id !== s.id))} aria-label="Quitar">
                  <X />
                </Button>
              </li>
            ))}
          </ol>
        )}
        <Button
          disabled={!dirty || saving}
          onClick={() =>
            startSave(async () => {
              const r = await saveQuizQuestionsAction(quizId, selected.map((s) => s.id));
              if (r?.ok) toast.success("Preguntas guardadas.");
              else toast.error(r?.error ?? "No se pudo guardar.");
            })
          }
        >
          {saving && <Loader2 className="animate-spin" />} Guardar selección
        </Button>

        <div className="grid gap-2 border-t pt-4">
          <p className="text-sm font-medium">Buscar preguntas aprobadas</p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search(1);
            }}
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Texto…" className="min-w-40 flex-1" aria-label="Buscar texto" />
            <NativeSelect value={unused} onChange={(e) => setUnused(e.target.value)} className="w-auto" aria-label="Uso">
              <option value="">Cualquier uso</option>
              <option value="never">Nunca usada</option>
              <option value="30">No usada en 30 días</option>
              <option value="90">No usada en 90 días</option>
            </NativeSelect>
            {categoryFilterId && (
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={onlyCategory} onChange={(e) => setOnlyCategory(e.target.checked)} className="size-4" /> Solo esta
                categoría
              </label>
            )}
            <Button type="submit" variant="secondary" disabled={searching}>
              {searching ? <Loader2 className="animate-spin" /> : <Search />} Buscar
            </Button>
          </form>
          {result && (
            <>
              <p className="text-xs text-muted-foreground">{result.total} resultados</p>
              <ul className="grid gap-1.5">
                {result.items.map((it) => {
                  const added = selected.some((s) => s.id === it.id);
                  return (
                    <li key={it.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                      <div className="flex-1">
                        <p className="text-pretty">{it.text ?? <em>(imagen)</em>}</p>
                        <p className="text-xs text-muted-foreground">
                          {it.categories.join(", ")} · dif. {it.difficulty}
                          {it.hasImage && " · 🖼"} ·{" "}
                          {it.used === 0 ? "nunca usada" : `usada ${it.used} ${it.used === 1 ? "vez" : "veces"} (última ${new Date(it.lastUsed!).toLocaleDateString("es-AR")})`}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={added ? "ghost" : "outline"}
                        disabled={added}
                        onClick={() => setSelected((s) => [...s, { id: it.id, text: it.text, status: "APPROVED", difficulty: it.difficulty }])}
                      >
                        {added ? "Agregada" : (
                          <>
                            <Plus /> Agregar
                          </>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {result.pages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1 || searching} onClick={() => search(page - 1)}>
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {page} / {result.pages}
                  </span>
                  <Button size="sm" variant="outline" disabled={page >= result.pages || searching} onClick={() => search(page + 1)}>
                    Siguiente
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
