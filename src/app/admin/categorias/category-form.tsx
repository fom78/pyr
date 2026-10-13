"use client";

import { useActionState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { UnsavedBadge, useUnsavedChanges } from "@/components/forms/unsaved-changes";
import { ImageUpload } from "@/components/forms/image-upload";
import { NativeSelect } from "@/components/forms/native-select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveCategoryAction } from "./actions";

export type OverrideField = {
  key: string;
  label: string;
  help?: string;
  unit?: string;
  kind: "number" | "boolean";
  globalValue: number | string | boolean;
};

type Props = {
  id: string | null;
  initial?: {
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    imageKey: string | null;
    imageUrl: string | null;
    active: boolean;
    settings: Record<string, unknown>;
  };
  overrides: OverrideField[];
};

export function CategoryForm({ id, initial, overrides }: Props) {
  const [state, action] = useActionState(saveCategoryAction.bind(null, id), null);
  const fe = state?.fieldErrors;
  const { ref, dirty } = useUnsavedChanges(state);
  return (
    <form ref={ref} action={action} className="grid gap-6">
      <FormError message={state?.error} />
      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" name="name" required defaultValue={initial?.name} errors={fe?.name} />
          <Field label="Identificador (slug)" name="slug" defaultValue={initial?.slug} errors={fe?.slug} hint="Se usa en la URL. Si lo dejás vacío se genera solo." />
          <Field label="Ícono (emoji)" name="icon" defaultValue={initial?.icon ?? ""} maxLength={16} />
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} maxLength={500} />
          </div>
          <div className="grid gap-1.5">
            <Label>Imagen de portada</Label>
            <ImageUpload name="imageKey" preset="cover" defaultKey={initial?.imageKey} defaultUrl={initial?.imageUrl} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="active" name="active" defaultChecked={initial?.active ?? true} />
            <Label htmlFor="active">Activa (visible para inscribirse)</Label>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Reglas propias de la categoría</CardTitle>
          <CardDescription>Dejá vacío para usar el valor global (entre paréntesis).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {overrides.map((o) =>
            o.kind === "boolean" ? (
              <div key={o.key} className="grid content-start gap-1.5">
                <Label htmlFor={`settings.${o.key}`}>{o.label}</Label>
                <NativeSelect
                  id={`settings.${o.key}`}
                  name={`settings.${o.key}`}
                  defaultValue={initial?.settings[o.key] !== undefined ? String(initial.settings[o.key]) : ""}
                >
                  <option value="">Usar global ({o.globalValue ? "sí" : "no"})</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </NativeSelect>
                {o.help && <p className="text-xs text-muted-foreground">{o.help}</p>}
              </div>
            ) : (
              <Field
                key={o.key}
                label={`${o.label}${o.unit ? ` (${o.unit})` : ""}`}
                name={`settings.${o.key}`}
                type="number"
                step="any"
                placeholder={`(${String(o.globalValue)})`}
                defaultValue={initial?.settings[o.key] !== undefined ? String(initial.settings[o.key]) : ""}
                hint={o.help}
              />
            ),
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Guardando…">Guardar categoría</SubmitButton>
        <UnsavedBadge dirty={dirty} />
        {!dirty && state?.message && <span className="text-success text-sm">{state.message}</span>}
      </div>
    </form>
  );
}
