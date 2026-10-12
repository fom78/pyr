"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NumberWheelGuard } from "./number-wheel-guard";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>
        {children}
        <NumberWheelGuard />
        <Toaster richColors position="top-center" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
