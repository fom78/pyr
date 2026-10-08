"use client";

import { useActionState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { ImageUpload } from "@/components/forms/image-upload";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveCategoryAction } from "./actions";

export type OverrideField = { key: string; label: string; help?: string; unit?: string; globalValue: number | string | boolean };

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
    frequencyDays: number | null;
    settings: Record<string, unknown>;
  };
  overrides: OverrideField[];
};

export function CategoryForm({ id, initial, overrides }: Props) {
  const [state, action] = useActionState(saveCategoryAction.bind(null, id), null);
  const fe = state?.fieldErrors;
  return (
    <form action={action} className="grid gap-6">
      <FormError message={state?.error} />
      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" name="name" required defaultValue={initial?.name} errors={fe?.name} />
          <Field label="Identificador (slug)" name="slug" defaultValue={initial?.slug} errors={fe?.slug} hint="Se usa en la URL. Si lo dejás vacío se genera solo." />
          <Field label="Ícono (emoji)" name="icon" defaultValue={initial?.icon ?? ""} maxLength={16} />
          <Field
            label="Frecuencia de publicación (días)"
            name="frequencyDays"
            type="number"
            min={1}
            max={60}
            defaultValue={initial?.frequencyDays ?? ""}
            hint="Vacío = usa el valor global."
          />
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
          {overrides.map((o) => (
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
          ))}
        </CardContent>
      </Card>
      <div>
        <SubmitButton pendingText="Guardando…">Guardar categoría</SubmitButton>
      </div>
    </form>
  );
}
