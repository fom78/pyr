"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  preset: "question" | "option" | "cover" | "avatar";
  defaultKey?: string | null;
  defaultUrl?: string | null;
  label?: string;
  className?: string;
  compact?: boolean;
  onChange?: (key: string | null) => void;
};

/** Sube la imagen al servidor (se redimensiona y comprime) y guarda el key en un input oculto. */
export function ImageUpload({ name, preset, defaultKey, defaultUrl, label = "Subir imagen", className, compact, onChange }: Props) {
  const [key, setKey] = useState(defaultKey ?? "");
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("preset", preset);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo subir la imagen.");
      setKey(data.key);
      setUrl(data.url);
      onChange?.(data.key);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input type="hidden" name={name} value={key} />
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      {url ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className={cn("rounded-md border object-cover", compact ? "size-12" : "h-24 w-36")} />
          <button
            type="button"
            className="absolute -top-2 -right-2 rounded-full border bg-background p-0.5 shadow"
            aria-label="Quitar imagen"
            onClick={() => {
              setKey("");
              setUrl("");
              onChange?.(null);
            }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      <Button type="button" variant="outline" size={compact ? "icon" : "sm"} disabled={busy} onClick={() => input.current?.click()} aria-label={label}>
        {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        {!compact && (url ? "Cambiar" : label)}
      </Button>
    </div>
  );
}
