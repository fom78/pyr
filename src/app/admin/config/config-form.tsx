"use client";

import { useActionState } from "react";
import { FormError } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveConfigAction } from "./actions";

export type ConfigField = {
  key: string;
  label: string;
  help?: string;
  unit?: string;
  kind: "number" | "boolean" | "enum" | "text" | "textarea";
  options?: string[];
  value: string | number | boolean;
  default: string | number | boolean;
  categoryOverride: boolean;
};

export function ConfigForm({ groups }: { groups: { name: string; fields: ConfigField[] }[] }) {
  const [state, action] = useActionState(saveConfigAction, null);
  return (
    <form action={action} className="grid gap-6">
      <FormError message={state?.error} />
      {state?.message && <p className="bg-success/10 text-success rounded-md px-3 py-2 text-sm">{state.message}</p>}
      {groups.map((g) => (
        <Card key={g.name}>
          <CardHeader>
            <CardTitle className="text-base">{g.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {g.fields.map((f) => {
              const id = `cfg-${f.key}`;
              const err = state?.fieldErrors?.[f.key];
              return (
                <div key={f.key} className="grid content-start gap-1.5">
                  <Label htmlFor={id} className="flex flex-wrap items-center gap-1.5">
                    {f.label} {f.unit && <span className="text-muted-foreground font-normal">({f.unit})</span>}
                    {f.categoryOverride && (
                      <Badge variant="outline" className="text-[10px]">
                        por categoría
                      </Badge>
                    )}
                  </Label>
                  {f.kind === "boolean" ? (
                    <>
                      <input type="hidden" name={f.key} value="false" />
                      <Switch id={id} name={f.key} value="true" defaultChecked={f.value === true} />
                    </>
                  ) : f.kind === "enum" ? (
                    <NativeSelect id={id} name={f.key} defaultValue={String(f.value)}>
                      {f.options?.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : f.kind === "textarea" ? (
                    <Textarea
                      id={id}
                      name={f.key}
                      rows={4}
                      defaultValue={String(f.value)}
                      className="font-mono text-xs"
                      aria-invalid={err ? true : undefined}
                    />
                  ) : f.kind === "text" ? (
                    <Input id={id} name={f.key} defaultValue={String(f.value)} aria-invalid={err ? true : undefined} />
                  ) : (
                    <Input
                      id={id}
                      name={f.key}
                      type="number"
                      step="any"
                      defaultValue={String(f.value)}
                      required
                      aria-invalid={err ? true : undefined}
                    />
                  )}
                  {f.help && <p className="text-muted-foreground text-xs">{f.help}</p>}
                  <p className="text-muted-foreground text-xs">Por defecto: {String(f.default) || "(vacío)"}</p>
                  {err?.map((e) => (
                    <p key={e} className="text-destructive text-sm">
                      {e}
                    </p>
                  ))}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
      <div className="sticky bottom-4">
        <SubmitButton size="lg" pendingText="Guardando…" className="shadow-lg">
          Guardar configuración
        </SubmitButton>
      </div>
    </form>
  );
}
