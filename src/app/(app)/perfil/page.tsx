import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { googleEnabled } from "@/server/env";
import { fileUrl } from "@/server/storage";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { PasswordForm, ProfileForm, LinkGoogle, ThemeSwitcher } from "./forms";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [accounts, stats] = await Promise.all([
    prisma.account.findMany({ where: { userId: user.id }, select: { providerId: true } }),
    prisma.attempt.aggregate({ where: { userId: user.id, status: { in: ["FINISHED", "TIMED_OUT"] } }, _count: true, _sum: { correctCount: true } }),
  ]);
  const created = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true } });
  const hasPassword = accounts.some((a) => a.providerId === "credential");
  const hasGoogle = accounts.some((a) => a.providerId === "google");
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader
        title="Perfil y ajustes"
        description={`@${user.username ?? "—"} · jugando desde ${formatDate(created.createdAt, user.timezone)} · ${stats._count} cuestionarios · ${stats._sum.correctCount ?? 0} aciertos`}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm name={user.name} timezone={user.timezone} image={user.image} imageUrl={fileUrl(user.image)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apariencia</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeSwitcher />
        </CardContent>
      </Card>
      {hasPassword && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cambiar contraseña</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Formas de ingresar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>Usuario y contraseña: {hasPassword ? "✓ configurado" : "no configurado"}</p>
          <p>Google: {hasGoogle ? "✓ vinculada" : "no vinculada"}</p>
          {googleEnabled() && !hasGoogle && <LinkGoogle />}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/historial">Mis intentos</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/creditos">Mis créditos</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/bienvenida">Ver la bienvenida otra vez</Link>
        </Button>
      </div>
    </div>
  );
}
