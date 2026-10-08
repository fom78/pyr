import { expect, type Page } from "@playwright/test";

export async function login(page: Page, username: string, password: string) {
  await page.goto("/ingresar");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: /Hola/ })).toBeVisible();
}

/** Responde la pregunta en pantalla con la primera opción y espera a la siguiente (o al resultado). */
export async function answerCurrent(page: Page) {
  const progress = await page.getByText(/^\d+ \/ \d+$/).textContent();
  await page.locator("main button").filter({ hasText: /^A/ }).click();
  await expect(async () => {
    const url = page.url();
    if (url.includes("/resultados/")) return;
    expect(await page.getByText(/^\d+ \/ \d+$/).textContent()).not.toBe(progress);
  }).toPass({ timeout: 20_000 });
}
