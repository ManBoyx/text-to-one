import { expect, test, type Page } from '@playwright/test';
import { envoyerMenu, installerFauxPont } from './fake-bridge';

async function ouvrirÉditeur(page: Page) {
  await installerFauxPont(page, { init: { type: 'new' } });
  await page.goto('/');
  await expect(page.locator('.ProseMirror')).toBeVisible();
}

test.describe('formules mathématiques', () => {
  test('la fenêtre montre un aperçu en direct puis insère la formule dans le texte', async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('Soit ');
    await page.locator('[data-action="insert:math"]').click();
    const fenêtre = page.locator('.math-dialog');
    await expect(fenêtre).toBeVisible();
    await expect(fenêtre.getByRole('button', { name: 'OK' })).toBeDisabled(); // rien d'écrit : rien à insérer
    await fenêtre.locator('.math-input').fill('\\frac{a}{b}');
    await expect(fenêtre.locator('.math-preview .katex')).toBeVisible();
    await expect(fenêtre.locator('.math-preview .mfrac, .math-preview .frac-line').first()).toBeVisible();
    await fenêtre.getByRole('button', { name: 'OK' }).click();
    await expect(fenêtre).toHaveCount(0);
    await expect(zone.locator('.math-inline .katex')).toHaveCount(1);
    await expect(zone.locator('.math-inline')).toHaveAttribute('aria-label', '\\frac{a}{b}');
  });

  test('une formule invalide bloque la validation et explique pourquoi', async ({ page }) => {
    await ouvrirÉditeur(page);
    await page.locator('.ProseMirror').click();
    await envoyerMenu(page, 'insert:math');
    const fenêtre = page.locator('.math-dialog');
    await fenêtre.locator('.math-input').fill('\\frac{a');
    await expect(fenêtre.locator('.math-error')).not.toBeEmpty();
    await expect(fenêtre.getByRole('button', { name: 'OK' })).toBeDisabled();
    await fenêtre.locator('.math-input').fill('x^2');
    await expect(fenêtre.locator('.math-error')).toBeEmpty();
    await expect(fenêtre.getByRole('button', { name: 'OK' })).toBeEnabled();
  });

  test('les raccourcis écrivent le code et laissent le curseur à remplir', async ({ page }) => {
    await ouvrirÉditeur(page);
    await page.locator('.ProseMirror').click();
    await envoyerMenu(page, 'insert:math');
    const fenêtre = page.locator('.math-dialog');
    await fenêtre.getByRole('button', { name: 'Fraction' }).click();
    await expect(fenêtre.locator('.math-input')).toHaveValue('\\frac{}{}');
    await page.keyboard.type('1');
    await expect(fenêtre.locator('.math-input')).toHaveValue('\\frac{1}{}');
  });

  test('« sur sa propre ligne » insère une formule de bloc', async ({ page }) => {
    await ouvrirÉditeur(page);
    await page.locator('.ProseMirror').click();
    await envoyerMenu(page, 'insert:math');
    const fenêtre = page.locator('.math-dialog');
    await fenêtre.locator('.math-input').fill('\\sum_{i=1}^{n} i');
    await fenêtre.getByLabel('Sur sa propre ligne').check();
    await fenêtre.getByRole('button', { name: 'OK' }).click();
    await expect(page.locator('.ProseMirror .math-block .katex-display')).toHaveCount(1);
  });

  test('un double-clic rouvre la formule et la modifie', async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await envoyerMenu(page, 'insert:math');
    await page.locator('.math-input').fill('a+b');
    await page.getByRole('button', { name: 'OK' }).click();
    await zone.locator('.math-inline').dblclick();
    const fenêtre = page.locator('.math-dialog');
    await expect(fenêtre.locator('.math-input')).toHaveValue('a+b');
    await expect(fenêtre.locator('h2')).toHaveText('Modifier la formule');
    await fenêtre.locator('.math-input').fill('a-b');
    await fenêtre.getByRole('button', { name: 'OK' }).click();
    await expect(zone.locator('.math-inline')).toHaveCount(1);
    await expect(zone.locator('.math-inline')).toHaveAttribute('aria-label', 'a-b');
  });

  test('taper $x^2$ crée la formule pendant la frappe', async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('Aire : $x^2$');
    await expect(zone.locator('.math-inline')).toHaveAttribute('aria-label', 'x^2');
    await expect(zone).toContainText('Aire :');
    await page.keyboard.type(' fin');
    await expect(zone.locator('p')).toContainText('fin');
  });

  test("le prix « 5 $ et 6 $ » ne devient pas une formule", async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('Entre 5 $ et 6 $');
    await expect(zone.locator('.math-inline')).toHaveCount(0);
  });

  test('taper $$x^2$$ seul sur une ligne crée une formule de bloc', async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('$$x^2$$');
    await expect(zone.locator('.math-block')).toHaveCount(1);
    await page.keyboard.type('suite'); // le curseur est passé sur la ligne suivante
    await expect(zone.locator('p').last()).toHaveText('suite');
  });

  test('la formule reste lisible sur la feuille blanche dans un thème sombre', async ({ page }) => {
    await ouvrirÉditeur(page);
    await envoyerMenu(page, 'view:theme-dark');
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('$x^2$');
    const couleur = await zone.locator('.math-inline .katex').evaluate((e) => getComputedStyle(e).color);
    expect(couleur).toBe('rgb(17, 17, 17)');
  });
});
