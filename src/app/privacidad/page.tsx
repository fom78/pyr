import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export const metadata: Metadata = { title: "Privacidad" };

/** Política de privacidad (pública: la pide la pantalla de consentimiento de Google). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <Link href="/" className="text-2xl" aria-label="PyR, inicio">
        <Logo />
      </Link>
      <h1 className="text-3xl font-bold">Privacidad</h1>
      <div className="text-muted-foreground grid gap-4 text-pretty [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold">
        <p>PyR es un juego de preguntas y respuestas. Guardamos lo mínimo para que puedas jugar y competir.</p>
        <h2>Qué datos guardamos</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>Tu nombre de usuario, el nombre que elegís mostrar y, si lo das, tu mail.</li>
          <li>
            Si entrás con Google: tu nombre, tu mail y tu foto de perfil de Google. No accedemos a tus contactos, archivos ni a nada
            más de tu cuenta de Google.
          </li>
          <li>Tus partidas: respuestas, puntajes, posiciones en las tablas y créditos del juego.</li>
          <li>Los reportes y sugerencias que nos mandes, y datos técnicos básicos para la seguridad (por ejemplo, el navegador).</li>
        </ul>
        <h2>Para qué los usamos</h2>
        <p>
          Solo para que funcione el juego: identificarte, mostrar las tablas y tu historial, darte los premios y atender tus reportes.
          No vendemos ni compartimos tus datos con terceros ni los usamos para publicidad.
        </p>
        <h2>Qué ven los demás jugadores</h2>
        <p>Tu nombre de usuario, tu nombre visible, tu foto y tus posiciones y puntajes en las tablas. Tu mail nunca se muestra.</p>
        <h2>Tus derechos</h2>
        <p>
          Podés cambiar tus datos desde tu perfil. Si querés dar de baja tu cuenta y borrar tus datos, pedilo desde{" "}
          <Link href="/soporte/nuevo" className="text-primary underline-offset-4 hover:underline">
            Soporte
          </Link>{" "}
          dentro del juego.
        </p>
      </div>
    </main>
  );
}
