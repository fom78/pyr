import Link from "next/link";
import { Button } from "@/components/ui/button";

export function StatusPage({
  code,
  title,
  description,
  action,
}: {
  code: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="font-heading text-6xl font-black text-primary">{code}</p>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
      {action ?? (
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      )}
    </div>
  );
}
