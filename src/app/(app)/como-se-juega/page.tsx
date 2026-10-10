import type { Metadata } from "next";
import { getSettings } from "@/server/config/service";
import { prisma } from "@/server/db";
import { rulesFromSettings } from "@/server/rules/view";
import { defaultRulesTexts, type RulesSection } from "@/server/rules/defaults";
import { wildcardStrategies } from "@/server/wildcards/strategies";
import { PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Cómo se juega" };

function Prose({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="text-pretty text-muted-foreground">
            {p}
          </p>
        ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

export default async function HowToPlayPage() {
  const [s, texts] = await Promise.all([getSettings(), prisma.rulesText.findMany()]);
  const r = rulesFromSettings(s);
  const text = (k: RulesSection) => texts.find((t) => t.section === k)?.content ?? defaultRulesTexts[k];
  const ex = r.scoringExample;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Cómo se juega" description="Reglas claras, con los valores que están vigentes hoy." />
      <div className="mb-6 grid gap-2">
        <Prose text={text("intro")} />
      </div>
      <Tabs defaultValue="liga">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="liga" className="flex-1">
            Modo liga
          </TabsTrigger>
          <TabsTrigger value="torneo" className="flex-1">
            Modo torneo
          </TabsTrigger>
          <TabsTrigger value="creditos" className="flex-1">
            Créditos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="liga" className="grid gap-4">
          <Prose text={text("league")} />
          <Section title={`❤️ Tus ${r.lives} vidas`}>
            <p>
              Cada vida es un lugar en una categoría: podés participar en hasta <strong>{r.lives} categorías al mismo tiempo</strong>.
            </p>
            <p>
              Si querés cambiar, podés <strong>abandonar</strong> una categoría. Esa vida queda en <strong>período de desvinculación</strong> durante{" "}
              {r.leaveCooldownDays} días: no podés jugar esa categoría y tu puntaje deja de figurar en su tabla. Pasado ese tiempo la vida se
              libera para otra categoría. A la misma categoría podés volver recién {r.rejoinBlockDays} días después de haber salido. Tu
              historial no se borra.
            </p>
          </Section>
          <Section title="🗓️ Los cuestionarios">
            <p>
              Cada categoría publica un cuestionario nuevo aproximadamente cada {r.frequencyDays} días. Pasan por estas etapas:
            </p>
            <ol className="ml-5 list-decimal space-y-1">
              <li>
                <strong>Próximamente</strong>: ya está anunciado, todavía no se puede jugar.
              </li>
              <li>
                <strong>Vigente</strong>: se puede jugar (habitualmente {r.activeDays} días). <strong>Tenés un solo intento.</strong> Apenas lo
                terminás, tu puntaje <strong>ya suma para la tabla</strong>.
              </li>
              <li>
                <strong>Cerrado</strong>: ya no se juega, se ven las respuestas correctas y <strong>sigue sumando para la tabla</strong> (es
                “computable”) durante {r.computableDays} días.
              </li>
              <li>
                <strong>Historial</strong>: queda para consultar, pero ya no suma.
              </li>
            </ol>
          </Section>
          <Section title="⏱️ Cómo se calcula el puntaje">
            <p>
              Cada respuesta correcta vale <strong>{r.scoring.base} puntos</strong> más un bonus de hasta <strong>{r.scoring.timeBonus}</strong>{" "}
              según qué tan rápido respondas: bonus × (1 − tiempo usado / tiempo límite). Así la precisión pesa más, pero la velocidad premia y
              desempata.
              {r.scoring.wrongPenalty > 0
                ? ` Cada error o pregunta sin responder resta ${r.scoring.wrongPenalty} puntos.`
                : " Las incorrectas o sin responder suman 0."}
            </p>
            <div className="rounded-md bg-muted p-3">
              <p className="font-medium">Ejemplo con {ex.limit} segundos por pregunta:</p>
              <ul className="ml-5 list-disc">
                <li>
                  Correcta en {ex.fast} s → {r.scoring.base} + {ex.fastPoints - r.scoring.base} = <strong>{ex.fastPoints} puntos</strong>
                </li>
                <li>
                  Correcta en {ex.slow} s → {r.scoring.base} + {ex.slowPoints - r.scoring.base} = <strong>{ex.slowPoints} puntos</strong>
                </li>
                <li>
                  Incorrecta → <strong>{ex.wrongPoints} puntos</strong>
                </li>
              </ul>
            </div>
            <p>Si dos jugadores empatan: gana quien tuvo más aciertos, después quien usó menos tiempo y después quien terminó antes.</p>
          </Section>
          <Section title={`🏅 La tabla: tus mejores ${r.bestK}`}>
            <p>
              En la tabla de cada categoría se suman tus <strong>{r.bestK} mejores puntajes</strong> entre los cuestionarios vigentes y los
              cerrados computables de los últimos {r.windowDays} días. La tabla se actualiza <strong>al instante</strong>: apenas terminás un
              cuestionario ves tu nuevo puesto. Por ejemplo: si jugaste 14 cuestionarios en el último mes y 2 ya no son computables, se toman los{" "}
              {r.bestK} mejores de los 12 restantes. Un mal día no te arruina la tabla, y siempre hay revancha.
            </p>
          </Section>
          <Section title="📱 Si se cierra la app a mitad de un cuestionario">
            <p>
              El reloj <strong>no se detiene</strong>: se mide en el servidor. Si volvés, seguís desde donde estabas con el tiempo que quede;
              la pregunta que estaba en pantalla cuenta como incorrecta si se le venció el tiempo. Las que no llegues a responder antes del
              límite cuentan como incorrectas. No se puede reiniciar un intento.
            </p>
            <p>
              {r.revealOnClose
                ? "Las respuestas correctas se muestran cuando el cuestionario cierra, para que nadie las pueda pasar."
                : "Al terminar podés ver qué respondiste bien y mal."}
            </p>
          </Section>
        </TabsContent>

        <TabsContent value="torneo" className="grid gap-4">
          <Prose text={text("tournament")} />
          <Section title="🏆 Cómo funciona un torneo">
            <ul className="ml-5 list-disc space-y-1">
              <li>Tiene fechas propias, una o varias categorías y una cantidad fija de cuestionarios.</li>
              <li>
                <strong>Se paga con créditos</strong> al inscribirse y <strong>no usa vidas</strong>. Cada torneo muestra su costo y su
                reglamento antes de confirmar.
              </li>
              <li>
                Suman <strong>todos</strong> los cuestionarios del torneo (no solo los mejores). Tiene su propia tabla.
              </li>
              <li>Los primeros puestos pueden ganar premios en créditos.</li>
              <li>Si un torneo se cancela, te devolvemos la inscripción.</li>
            </ul>
          </Section>
          <Section title="🃏 Comodines">
            <p>
              Cada torneo define qué comodines se pueden usar y cuántos. Se elige <strong>antes de empezar</strong> un cuestionario (por defecto,
              hasta {r.wildcardsPerQuiz} por cuestionario) y <strong>una vez usado no vuelve</strong>, aunque te vaya mal.
            </p>
            <ul className="grid gap-2">
              {Object.values(wildcardStrategies).map((w) => (
                <li key={w.type} className="rounded-md bg-muted p-3">
                  <p className="font-medium">{w.name}</p>
                  <p>{w.description}</p>
                  <p className="text-muted-foreground">Ejemplo: {w.example(r.scoring)}</p>
                </li>
              ))}
            </ul>
          </Section>
        </TabsContent>

        <TabsContent value="creditos" className="grid gap-4">
          <Prose text={text("credits")} />
          <Section title="🪙 Cómo se ganan">
            <ul className="ml-5 list-disc space-y-1">
              <li>Bono de bienvenida: {r.credits.signup} créditos.</li>
              <li>Por cada cuestionario de liga completado: {r.credits.quiz}.</li>
              <li>
                Extra por buen desempeño (≥ {r.credits.goodPct}% de aciertos): {r.credits.good}. Si es perfecto: {r.credits.perfect} en lugar del
                anterior.
              </li>
              <li>
                Racha: si completás {r.credits.streakLength} cuestionarios seguidos de una categoría sin saltear ninguno, ganás {r.credits.streakBonus}.
              </li>
              <li>Premios por puesto en torneos.</li>
            </ul>
          </Section>
          <Section title="🎟️ Cómo se gastan">
            <p>Se usan para inscribirte en torneos. En “Créditos” ves tu saldo y cada movimiento con su motivo.</p>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
