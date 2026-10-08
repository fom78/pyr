import { StatusPage } from "@/components/layout/status-page";

export default function Forbidden() {
  return (
    <StatusPage code="403" title="No tenés acceso" description="Tu cuenta no tiene permisos para ver esta sección." />
  );
}
