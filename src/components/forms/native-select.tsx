import { cn } from "@/lib/utils";

/** <select> nativo con estilo de input: mejor en celulares y simple en formularios con server actions. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 [&>option]:bg-background",
        className,
      )}
      {...props}
    />
  );
}
