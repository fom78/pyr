import { Badge } from "@/components/ui/badge";
import type { ReviewStatus } from "@/generated/prisma/enums";

const MAP: Record<ReviewStatus, { label: string; className: string }> = {
  PENDING_REVIEW: { label: "Pendiente", className: "bg-warning/20 text-warning-foreground dark:text-warning" },
  APPROVED: { label: "Aprobada", className: "bg-success/15 text-success" },
  REJECTED: { label: "Rechazada", className: "bg-destructive/15 text-destructive" },
};

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const m = MAP[status];
  return (
    <Badge variant="outline" className={`border-transparent ${m.className}`}>
      {m.label}
    </Badge>
  );
}
