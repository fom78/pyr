"use client";

import { useActionState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Field, FormError } from "@/components/forms/field";
import { ImageUpload } from "@/components/forms/image-upload";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { changePasswordAction, updateProfileAction } from "./actions";

const TZ_LABEL: Record<string, string> = {
  "America/Argentina/Buenos_Aires": "Argentina",
  "America/Montevideo": "Uruguay",
  "America/Santiago": "Chile",
  "America/Sao_Paulo": "Brasil (São Paulo)",
  "America/Mexico_City": "México",
  "America/Bogota": "Colombia",
  "America/Lima": "Perú",
  "Europe/Madrid": "España",
  UTC: "UTC",
};

export function ProfileForm({ name, timezone, image, imageUrl }: { name: string; timezone: string; image: string | null; imageUrl: string | null }) {
  const [state, action] = useActionState(updateProfileAction, null);
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      {state?.message && <p className="text-sm text-success">{state.message}</p>}
      <div className="grid gap-1.5">
        <Label>Avatar</Label>
        <ImageUpload name="image" preset="avatar" defaultKey={image} defaultUrl={imageUrl} label="Subir foto" />
      </div>
      <Field label="Nombre visible" name="name" defaultValue={state?.values?.name ?? name} required maxLength={40} errors={state?.fieldErrors?.name} />
      <div className="grid gap-1.5">
        <Label htmlFor="timezone">Zona horaria</Label>
        <NativeSelect id="timezone" name="timezone" defaultValue={timezone}>
          {Object.entries(TZ_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </div>
      <SubmitButton className="w-fit">Guardar</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, null);
  const fe = state?.fieldErrors;
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      {state?.message && <p className="text-sm text-success">{state.message}</p>}
      <Field label="Contraseña actual" name="currentPassword" type="password" autoComplete="current-password" required errors={fe?.currentPassword} />
      <Field label="Nueva contraseña" name="newPassword" type="password" autoComplete="new-password" required minLength={8} errors={fe?.newPassword} />
      <Field label="Repetir nueva contraseña" name="confirm" type="password" autoComplete="new-password" required errors={fe?.confirm} />
      <SubmitButton variant="outline" className="w-fit">
        Cambiar contraseña
      </SubmitButton>
    </form>
  );
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const opts = [
    { v: "light", l: "Claro", I: Sun },
    { v: "dark", l: "Oscuro", I: Moon },
    { v: "system", l: "Sistema", I: Monitor },
  ];
  return (
    <div role="radiogroup" aria-label="Tema" className="flex flex-wrap gap-2">
      {opts.map(({ v, l, I }) => (
        <Button key={v} type="button" role="radio" aria-checked={theme === v} variant="outline" className={cn(theme === v && "border-primary bg-primary/10")} onClick={() => setTheme(v)}>
          <I /> {l}
        </Button>
      ))}
    </div>
  );
}

export function LinkGoogle() {
  return (
    <Button type="button" variant="outline" className="w-fit" onClick={() => authClient.linkSocial({ provider: "google", callbackURL: "/perfil" })}>
      Vincular cuenta de Google
    </Button>
  );
}
