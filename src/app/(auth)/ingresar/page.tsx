import type { Metadata } from "next";
import Link from "next/link";
import { googleEnabled } from "@/server/env";
import { oauthErrorMessage } from "@/server/actions";
import { FormError } from "@/components/forms/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";
import { GoogleButton, OrDivider } from "../google-button";

export const metadata: Metadata = { title: "Ingresar" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = one(sp.next);
  const google = googleEnabled();
  // Vuelta del ingreso con Google con error (cancelado, cuenta suspendida, etc.).
  const oauthError = oauthErrorMessage(one(sp.error), one(sp.error_description));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Ingresar</CardTitle>
        <CardDescription>Entrá para jugar tus categorías y torneos.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormError message={oauthError ?? undefined} />
        {google && (
          <>
            <GoogleButton next={next} />
            <OrDivider />
          </>
        )}
        <SignInForm next={next} autoFocus={!google} />
        <p className="text-muted-foreground text-center text-sm">
          ¿No tenés cuenta?{" "}
          <Link href="/registro" className="text-primary font-medium underline-offset-4 hover:underline">
            Registrate
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
