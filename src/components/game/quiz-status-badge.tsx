import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/server/quiz/status";
import type { QuizStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const STYLE: Record<QuizStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SCHEDULED: "bg-primary/10 text-primary",
  ACTIVE: "bg-success/15 text-success",
  CLOSED: "bg-warning/20 text-warning-foreground dark:text-warning",
  EXPIRED: "bg-muted text-muted-foreground",
};

export function QuizStatusBadge({ status, className }: { status: QuizStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", STYLE[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
