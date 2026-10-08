"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldErrors, FormError } from "@/components/forms/field";
import { ImageUpload } from "@/components/forms/image-upload";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { cn } from "@/lib/utils";
import { checkDuplicatesAction, saveQuestionAction } from "./actions";

type Option = { text?: string; imageKey?: string; imageUrl?: string | null };

export type EditorInitial = {
  type: "TEXT" | "IMAGE" | "IMAGE_TEXT";
  text?: string;
  imageKey?: string;
  imageUrl?: string | null;
  difficulty: number;
  explanation?: string;
  source?: string;
  categoryIds: string[];
  tags: string[];
  shuffleOptions: boolean | null;
  options: Option[];
  correctIndex: number;
};

const EMPTY: EditorInitial = {
  type: "TEXT",
  difficulty: 2,
  categoryIds: [],
  tags: [],
  shuffleOptions: null,
  options: [{}, {}, {}, {}],
  correctIndex: 0,
};

type Props = {
  id: string | null;
  initial?: EditorInitial;
  categories: { id: string; name: string; icon: string | null }[];
  locked: boolean;
  canAutoApprove: boolean;
};

export function QuestionEditor({ id, initial = EMPTY, categories, locked, canAutoApprove }: Props) {
  const [q, setQ] = useState<EditorInitial>(initial);
  const [state, action] = useActionState(saveQuestionAction.bind(null, id), null);
  const [dupes, setDupes] = useState<{ id: string; text: string | null; similarity: number }[]>([]);
  const [, startCheck] = useTransition();
  const mode = !id ? "create" : locked ? "version" : "update";
  const fe = state?.fieldErrors;

  const set = <K extends keyof EditorInitial>(k: K, v: EditorInitial[K]) => setQ((p) => ({ ...p, [k]: v }));
  const setOption = (i: number, patch: Partial<Option>) =>
    setQ((p) => ({ ...p, options: p.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  const payload = {
    ...q,
    options: q.options.map(({ text, imageKey }) => ({ text, imageKey })),
    imageUrl: undefined,
  };

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <input type="hidden" name="mode" value={mode} />
      <FormError message={state?.error} />
      {locked && (
        <div className="flex gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-warning" />
          <span>
            Esta pregunta ya se usó en un cuestionario que abrió, así que no se puede modificar. Al guardar se crea una <strong>versión nueva</strong>
            {" "}y la anterior queda archivada (los resultados existentes no cambian).
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Enunciado</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="type">Tipo</Label>
            <NativeSelect id="type" value={q.type} onChange={(e) => set("type", e.target.value as EditorInitial["type"])}>
              <option value="TEXT">Solo texto</option>
              <option value="IMAGE_TEXT">Imagen + texto</option>
              <option value="IMAGE">Solo imagen</option>
            </NativeSelect>
          </div>
          {q.type !== "IMAGE" && (
            <div className="grid gap-1.5">
              <Label htmlFor="text">Pregunta</Label>
              <Textarea
                id="text"
                value={q.text ?? ""}
                maxLength={1000}
                onChange={(e) => set("text", e.target.value)}
                onBlur={(e) => {
                  const text = e.target.value;
                  startCheck(async () => setDupes(text.length > 8 ? await checkDuplicatesAction(text, id ?? undefined) : []));
                }}
                aria-invalid={fe?.text ? true : undefined}
              />
              <FieldErrors errors={fe?.text} />
              {dupes.length > 0 && (
                <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
                  <p className="mb-1 font-medium">Posibles duplicados:</p>
                  <ul className="grid gap-1">
                    {dupes.map((d) => (
                      <li key={d.id}>
                        <Link href={`/admin/preguntas/${d.id}`} target="_blank" className="underline">
                          {d.text}
                        </Link>{" "}
                        <span className="text-muted-foreground">({Math.round(d.similarity * 100)}% parecida)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {q.type !== "TEXT" && (
            <div className="grid gap-1.5">
              <Label>Imagen</Label>
              <ImageUpload name="_img" preset="question" defaultKey={q.imageKey} defaultUrl={q.imageUrl} onChange={(k) => set("imageKey", k ?? undefined)} />
              <FieldErrors errors={fe?.imageKey} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Opciones</CardTitle>
          <p className="text-sm text-muted-foreground">Entre 4 y 5. Tocá el círculo para marcar la correcta.</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div role="radiogroup" aria-label="Opción correcta" className="grid gap-3">
            {q.options.map((o, i) => {
              const correct = q.correctIndex === i;
              return (
                <div key={i} className={cn("flex items-center gap-2 rounded-md border p-2", correct && "border-success bg-success/5")}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={correct}
                    aria-label={`Marcar opción ${i + 1} como correcta`}
                    onClick={() => set("correctIndex", i)}
                    className={cn("shrink-0", correct ? "text-success" : "text-muted-foreground")}
                  >
                    {correct ? <CheckCircle2 className="size-6" /> : <Circle className="size-6" />}
                  </button>
                  <Input
                    value={o.text ?? ""}
                    placeholder={`Opción ${i + 1}`}
                    maxLength={300}
                    aria-label={`Texto de la opción ${i + 1}`}
                    onChange={(e) => setOption(i, { text: e.target.value })}
                  />
                  <ImageUpload
                    compact
                    name={`_opt${i}`}
                    preset="option"
                    label={`Imagen para la opción ${i + 1}`}
                    defaultKey={o.imageKey}
                    defaultUrl={o.imageUrl}
                    onChange={(k) => setOption(i, { imageKey: k ?? undefined })}
                  />
                  {q.options.length > 4 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar opción ${i + 1}`}
                      onClick={() =>
                        setQ((p) => ({
                          ...p,
                          options: p.options.filter((_, j) => j !== i),
                          correctIndex: p.correctIndex === i ? 0 : p.correctIndex > i ? p.correctIndex - 1 : p.correctIndex,
                        }))
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {q.options.length < 5 && (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set("options", [...q.options, {}])}>
              <Plus /> Agregar 5ª opción
            </Button>
          )}
          <FieldErrors errors={[...(fe?.options ?? []), ...(fe?.correctIndex ?? [])]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clasificación</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Categorías</legend>
            <div className="flex flex-wrap gap-3">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={q.categoryIds.includes(c.id)}
                    onCheckedChange={(v) =>
                      set("categoryIds", v ? [...q.categoryIds, c.id] : q.categoryIds.filter((x) => x !== c.id))
                    }
                  />
                  {c.icon} {c.name}
                </label>
              ))}
            </div>
            <FieldErrors errors={fe?.categoryIds} />
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="difficulty">Dificultad</Label>
            <NativeSelect id="difficulty" value={q.difficulty} onChange={(e) => set("difficulty", Number(e.target.value))}>
              <option value={1}>1 · Muy fácil</option>
              <option value={2}>2 · Fácil</option>
              <option value={3}>3 · Media</option>
              <option value={4}>4 · Difícil</option>
              <option value={5}>5 · Muy difícil</option>
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tags">Etiquetas</Label>
            <Input
              id="tags"
              defaultValue={q.tags.join(", ")}
              placeholder="historia, argentina"
              onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="shuffle">Orden aleatorio de opciones</Label>
            <NativeSelect
              id="shuffle"
              value={q.shuffleOptions === null ? "" : String(q.shuffleOptions)}
              onChange={(e) => set("shuffleOptions", e.target.value === "" ? null : e.target.value === "true")}
            >
              <option value="">Según el cuestionario</option>
              <option value="true">Siempre mezclar</option>
              <option value="false">Nunca mezclar (ej. “todas las anteriores”)</option>
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="source">Fuente (opcional)</Label>
            <Input id="source" value={q.source ?? ""} maxLength={500} onChange={(e) => set("source", e.target.value)} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="explanation">Explicación (se muestra en la revisión de respuestas)</Label>
            <Textarea id="explanation" value={q.explanation ?? ""} maxLength={2000} onChange={(e) => set("explanation", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingText="Guardando…">{mode === "version" ? "Guardar como versión nueva" : "Guardar pregunta"}</SubmitButton>
        {canAutoApprove && mode !== "update" && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="approve" /> Aprobar directamente
          </label>
        )}
      </div>
    </form>
  );
}
