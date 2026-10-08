"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { completeOnboardingAction } from "../actions";

type Step = { emoji: string; title: string; body: string };

export function Onboarding({ steps }: { name: string; steps: Step[] }) {
  const [i, setI] = useState(0);
  const last = i === steps.length - 1;
  const step = steps[i];
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center">
      <Card>
        <CardContent className="grid gap-6 py-8 text-center">
          <div className="text-6xl" aria-hidden>
            {step.emoji}
          </div>
          <div className="grid gap-2" aria-live="polite">
            <h1 className="text-2xl font-bold text-balance">{step.title}</h1>
            <p className="text-pretty text-muted-foreground">{step.body}</p>
          </div>
          <div className="flex justify-center gap-1.5" aria-label={`Paso ${i + 1} de ${steps.length}`}>
            {steps.map((_, j) => (
              <span key={j} className={cn("h-1.5 w-6 rounded-full", j === i ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <form action={completeOnboardingAction}>
              <Button type="submit" variant="ghost">
                Saltear
              </Button>
            </form>
            {last ? (
              <form action={completeOnboardingAction}>
                <Button type="submit" size="lg">
                  Elegir mis categorías
                </Button>
              </form>
            ) : (
              <Button size="lg" onClick={() => setI(i + 1)}>
                Siguiente
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
