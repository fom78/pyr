import type { Metadata } from "next";
import Link from "next/link";
import { googleEnabled } from "@/server/env";
import { getSettings } from "@/server/config/service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignUpForm } from "./sign-up-form";
import { GoogleButton } from "../google-button";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function SignUpPage() {
  const s = await getSettings();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Crear cuenta</CardTitle>
        <CardDescription>
          Elegí hasta {s["lives.max"]} categorías y competí.
          {s["credits.signupBonus"] > 0 && <> Te regalamos {s["credits.signupBonus"]} créditos de bienvenida.</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SignUpForm />
        {googleEnabled() && <GoogleButton label="Registrarme con Google" />}
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{" "}
          <Link href="/ingresar" className="font-medium text-primary underline-offset-4 hover:underline">
            Ingresá
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
