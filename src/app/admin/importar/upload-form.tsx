"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/forms/field";

export function UploadForm({ canApprove }: { canApprove: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/import", { method: "POST", body: new FormData(e.currentTarget) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo procesar el archivo.");
      router.push(`/admin/importar/${data.jobId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormError message={error} />
      <div className="grid gap-1.5">
        <Label htmlFor="xlsx">Excel (.xlsx)</Label>
        <Input id="xlsx" name="xlsx" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="zip">Imágenes (.zip, opcional)</Label>
        <Input id="zip" name="zip" type="file" accept=".zip,application/zip" />
      </div>
      {canApprove && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="approve" /> Aprobar directamente las preguntas importadas
        </label>
      )}
      <Button type="submit" disabled={busy} className="w-fit">
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {busy ? "Procesando… (puede tardar con imágenes)" : "Previsualizar"}
      </Button>
    </form>
  );
}
