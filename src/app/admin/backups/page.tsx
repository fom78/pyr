import { Download } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { backupDir, backupEnv, listBackups, retentionDays } from "@/server/backups/service";
import { EmptyState, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AutoRefresh, CreateBackupButton } from "./backup-controls";

export const metadata = { title: "Backups" };

const STATUS = {
  PENDING: { label: "En cola", className: "bg-muted text-muted-foreground" },
  RUNNING: { label: "Generando…", className: "bg-primary/15 text-primary" },
  DONE: { label: "Listo", className: "bg-success/15 text-success" },
  FAILED: { label: "Falló", className: "bg-destructive/15 text-destructive" },
} as const;

function size(bytes: bigint | null) {
  if (bytes === null) return null;
  const n = Number(bytes);
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function BackupsPage() {
  const user = await requirePermission("backup.manage");
  const backups = await listBackups();
  const busy = backups.some((b) => b.status === "PENDING" || b.status === "RUNNING");
  const env = backupEnv();
  const remoteEnv = env === "local" ? "prod" : env;
  return (
    <>
      <AutoRefresh active={busy} />
      <PageHeader
        title="Backups"
        description={`Base de datos e imágenes subidas. Se hace uno automático por día y se guardan ${retentionDays()} días (los manuales, el doble).`}
        actions={<CreateBackupButton busy={busy} />}
      />
      <div className="grid gap-6">
        {backups.length === 0 ? (
          <EmptyState title="Todavía no hay backups" description="Creá uno ahora o esperá al automático de la madrugada." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul>
                {backups.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 text-sm last:border-0">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {formatDateTime(b.createdAt, user.timezone)}
                        <Badge className={cn("border-transparent", STATUS[b.status].className)}>{STATUS[b.status].label}</Badge>
                        <span className="text-muted-foreground text-xs font-normal">
                          {b.kind === "MANUAL" ? `manual${b.requestedBy ? ` (${b.requestedBy.name})` : ""}` : "automático"}
                        </span>
                      </span>
                      {b.dbFile && <span className="text-muted-foreground text-xs break-all">{b.dbFile}</span>}
                      {b.error && <span className="text-destructive text-xs">{b.error}</span>}
                    </div>
                    {b.status === "DONE" && (
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          {/* <a> común: es una descarga, no una navegación */}
                          <a href={`/api/admin/backups/${b.id}/db`} download>
                            <Download /> Base ({size(b.dbBytes)})
                          </a>
                        </Button>
                        {b.uploadsFile && (
                          <Button asChild size="sm" variant="outline">
                            <a href={`/api/admin/backups/${b.id}/uploads`} download>
                              <Download /> Imágenes ({size(b.uploadsBytes)})
                            </a>
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Traerlo a tu PC</CardTitle>
            <CardDescription>
              Entorno: <strong>{env}</strong> · los archivos están en <code className="text-xs">{backupDir()}</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>Con los botones de arriba se descarga desde el navegador. Desde la terminal, en la carpeta del proyecto:</p>
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
              {`bash scripts/backup-pull.sh ${remoteEnv}             # el último backup de la base
bash scripts/backup-pull.sh ${remoteEnv} --images    # + imágenes
bash scripts/backup-pull.sh ${remoteEnv} --restore   # y lo carga en tu base local`}
            </pre>
            <p className="text-muted-foreground text-xs">
              Necesita <code>PYR_SSH</code> (por ejemplo <code>deploy@tu-vps</code>) en el entorno o en <code>.env.local</code>. Lo
              genera el worker: en local, con <code>npm run worker</code> corriendo (o <code>npm run worker:once</code>).
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
