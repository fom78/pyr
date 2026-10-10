import { expect, test } from "@playwright/test";
import { answerCurrent, login } from "./helpers";

test("jugar un cuestionario completo, recargando a mitad de camino", async ({ page }) => {
  await login(page, "beto", "Jugador123!");

  await page.goto("/categorias/futbol");
  await page.getByRole("link", { name: "Jugar" }).first().click();
  await expect(page.getByText("Tenés un solo intento.")).toBeVisible();
  await page.getByRole("button", { name: "Empezar ahora" }).click();

  await expect(page.getByText("1 / 5")).toBeVisible();
  // La respuesta correcta no viaja al cliente
  expect(await page.content()).not.toMatch(/isCorrect/);
  await answerCurrent(page);
  await expect(page.getByText("2 / 5")).toBeVisible();

  // Recargar no reinicia: sigue en la pregunta 2 con el reloj corriendo
  await page.reload();
  await expect(page.getByText("2 / 5")).toBeVisible();

  for (let i = 0; i < 4; i++) await answerCurrent(page);

  await expect(page).toHaveURL(/\/resultados\//);
  await expect(page.getByRole("heading", { name: "Revisión" })).toBeVisible();
  await expect(page.getByText(/Las respuestas correctas se muestran cuando cierre/)).toBeVisible();
  // La tabla de la liga se actualiza al terminar
  await expect(page.getByText(/Tu puesto en la liga/)).toBeVisible();

  // No se puede volver a jugar
  await page.goto("/categorias/futbol");
  await expect(page.getByRole("link", { name: /pts/ }).first()).toBeVisible();
});
