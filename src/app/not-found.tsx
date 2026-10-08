import { StatusPage } from "@/components/layout/status-page";

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="No encontramos esta página"
      description="Puede que el enlace esté mal escrito o que el contenido ya no exista."
    />
  );
}
