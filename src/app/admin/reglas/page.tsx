import Link from "next/link";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { defaultRulesTexts, rulesSections, type RulesSection } from "@/server/rules/defaults";
import { PageHeader } from "@/components/common";
import { RulesForm } from "./rules-form";

export const metadata = { title: "Textos de reglas" };

export default async function RulesTextsPage() {
  await requirePermission("rules.edit");
  const rows = await prisma.rulesText.findMany();
  const texts = Object.fromEntries(
    (Object.keys(rulesSections) as RulesSection[]).map((k) => [k, rows.find((r) => r.section === k)?.content ?? defaultRulesTexts[k]]),
  ) as Record<RulesSection, string>;
  return (
    <>
      <PageHeader
        title="Textos de reglas"
        description={
          <>
            Textos introductorios de{" "}
            <Link href="/como-se-juega" className="underline">
              Cómo se juega
            </Link>
            . Los números (vidas, días, puntos, K…) no se escriben acá: salen siempre de la configuración.
          </>
        }
      />
      <RulesForm sections={rulesSections} texts={texts} />
    </>
  );
}
