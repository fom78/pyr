import type { Metadata } from "next";
import Link from "next/link";
import { googleEnabled } from "@/server/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";
import { GoogleButton } from "../google-button";

export const metadata: Metadata = { title: "Ingresar" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Ingresar</CardTitle>
        <CardDescription>Entrá para jugar tus categorías y torneos.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SignInForm next={typeof next === "string" ? next : undefined} />
        {googleEnabled() && <GoogleButton />}
        <p className="text-center text-sm text-muted-foreground">
          ¿No tenés cuenta?{" "}
          <Link href="/registro" className="font-medium text-primary underline-offset-4 hover:underline">
            Registrate
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
