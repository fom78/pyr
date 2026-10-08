import { expect, test } from "@playwright/test";
import { answerCurrent, login } from "./helpers";

test("inscribirse a un torneo pagando créditos y jugar con un comodín", async ({ page }) => {
  // dani no está inscripto en la Copa Primavera del seed
  await login(page, "dani", "Jugador123!");
  const balanceBefore = Number((await page.getByRole("banner").getByRole("link", { name: /créditos/ }).textContent())?.replace(/\D/g, ""));

  await page.goto("/torneos/copa-primavera");
  await page.getByRole("button", { name: "Inscribirme" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Costo de inscripción")).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Confirmar inscripción" });
  await expect(confirm).toBeDisabled(); // requiere aceptación explícita
  await dialog.getByRole("checkbox").click();
  await confirm.click();
  await expect(page.getByText("✓ Inscripto")).toBeVisible();

  await page.goto("/creditos");
  await expect(page.getByText("Inscripción: Copa PyR de Primavera")).toBeVisible();
  const balanceAfter = Number((await page.getByRole("banner").getByRole("link", { name: /créditos/ }).textContent())?.replace(/\D/g, ""));
  expect(balanceAfter).toBe(balanceBefore - 30);

  // Jugar la fecha vigente con "Doble por acierto"
  await page.goto("/torneos/copa-primavera");
  await page.getByRole("link", { name: "Jugar" }).first().click();
  await page.getByText("Doble por acierto").click();
  await expect(page.getByText("el comodín se gasta y no se recupera")).toBeVisible();
  await page.getByRole("button", { name: "Empezar ahora" }).click();
  await expect(page.getByText(/Doble por acierto activo/)).toBeVisible();
  const total = Number((await page.getByText(/^1 \/ \d+$/).textContent())!.split("/")[1]);
  for (let i = 0; i < total; i++) await answerCurrent(page);
  await expect(page).toHaveURL(/\/resultados\//);
  await expect(page.getByText(/Usaste Doble por acierto/)).toBeVisible();
});
