import { requireUser } from "@/server/auth/session";

export default async function HomePage() {
  const user = await requireUser();
  return (
    <div className="grid gap-2">
      <h1 className="text-2xl font-bold">Hola, {user.name}</h1>
      <p className="text-muted-foreground">Inicio en construcción.</p>
    </div>
  );
}
