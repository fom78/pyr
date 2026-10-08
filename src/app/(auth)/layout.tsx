import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { Logo } from "@/components/layout/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-primary/10 to-background px-4 py-10">
      <Link href="/" className="mb-6" aria-label="Inicio">
        <Logo className="text-3xl" />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
