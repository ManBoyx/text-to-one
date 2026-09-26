import { expect, test, type Page } from '@playwright/test';
import { envoyerMenu, installerFauxPont } from './fake-bridge';

async function ouvrir(page: Page) {
  await installerFauxPont(page, { init: { type: 'new' } });
  await page.goto('/');
  await expect(page.locator('.ProseMirror')).toBeVisible();
}

const racine = (page: Page, variable: string) => page.evaluate((v) => document.documentElement.style.getPropertyValue(v).trim(), variable);
const thème = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? 'system');
const fondCalculé = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('thèmes', () => {
  test('la fenêtre des thèmes propose clair, sombre, automatique, les palettes et le thème personnalisé', async ({ page }) => {
    await ouvrir(page);
    await envoyerMenu(page, 'view:themes');
    const cartes = page.locator('.theme-card');
    await expect(cartes).toHaveCount(11);
    await expect(page.getByRole('radiogroup', { name: 'Thèmes disponibles' })).toBeVisible();
    const noms = await page.locator('.theme-name').allTextContents();
    expect(noms).toEqual(['Automatique', 'Clair', 'Sombre', 'Océan', 'Forêt', 'Crépuscule', 'Sépia', 'Menthe', 'Rose', 'Contraste élevé', 'Personnalisé']);
    await expect(page.locator('.theme-card[aria-checked="true"]')).toHaveCount(1);
    await expect(page.locator('.theme-card[data-theme="system"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('choisir une palette change tout de suite les couleurs, et « Clair » remet celles de départ', async ({ page }) => {
    await ouvrir(page);
    const avant = await fondCalculé(page);
    await envoyerMenu(page, 'view:themes');
    await page.locator('.theme-card[data-theme="ocean"]').click();
    expect(await thème(page)).toBe('ocean');
    expect(await racine(page, '--bg')).toBe('#0b1a2b');
    expect(await fondCalculé(page)).toBe('rgb(11, 26, 43)');
    await expect(page.locator('.theme-card[data-theme="ocean"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('.theme-card[data-theme="light"]').click();
    expect(await thème(page)).toBe('light');
    expect(await racine(page, '--bg')).toBe('');
    expect(await fondCalculé(page)).toBe('rgb(236, 239, 243)');
    await page.locator('.theme-card[data-theme="system"]').click();
    expect(await thème(page)).toBe('system');
    expect(await fondCalculé(page)).toBe(avant);
  });

  test('chaque palette du menu natif s\'applique, et la feuille reste blanche', async ({ page }) => {
    await ouvrir(page);
    for (const id of ['ocean', 'foret', 'crepuscule', 'sepia', 'menthe', 'rose', 'contraste']) {
      await envoyerMenu(page, `view:theme-${id}`);
      expect(await thème(page), id).toBe(id);
      expect(await racine(page, '--surface'), id).toMatch(/^#[0-9a-f]{6}$/);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.sheet')!).backgroundColor), id).toBe('rgb(255, 255, 255)');
    }
    await envoyerMenu(page, 'view:theme-dark');
    expect(await thème(page)).toBe('dark');
    expect(await racine(page, '--surface')).toBe('');
  });

  test('le thème personnalisé se fabrique avec quatre couleurs, prévient si le texte est illisible et se retrouve après un redémarrage', async ({ page }) => {
    await ouvrir(page);
    await envoyerMenu(page, 'view:themes');
    const champ = (nom: string) => page.locator('.theme-color', { hasText: nom }).locator('input');
    await champ('Fond').fill('#221133');
    await champ('Barres et menus').fill('#2e1a47');
    await champ('Texte').fill('#f5ecff');
    await champ('Accent').fill('#ff9f43');
    expect(await thème(page)).toBe('custom');
    expect(await racine(page, '--bg')).toBe('#221133');
    expect(await racine(page, '--surface')).toBe('#2e1a47');
    expect(await racine(page, '--accent')).toBe('#ff9f43');
    expect(await racine(page, '--accent-contrast')).toBe('#000000');
    await expect(page.locator('.theme-contrast')).toHaveText('Ces couleurs se lisent bien.');
    await expect(page.locator('.theme-card[data-theme="custom"]')).toHaveAttribute('aria-checked', 'true');

    await champ('Texte').fill('#3a2a55');
    await expect(page.locator('.theme-contrast')).toContainText('difficile à lire');
    await champ('Texte').fill('#f5ecff');

    await page.reload();
    await expect(page.locator('.ProseMirror')).toBeVisible();
    expect(await thème(page)).toBe('custom');
    expect(await racine(page, '--bg')).toBe('#221133');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
  });

  test("« Remettre les couleurs de départ » restaure le thème personnalisé d'origine", async ({ page }) => {
    await ouvrir(page);
    await envoyerMenu(page, 'view:themes');
    await page.locator('.theme-color', { hasText: 'Fond' }).locator('input').fill('#123456');
    expect(await racine(page, '--bg')).toBe('#123456');
    await page.getByRole('button', { name: 'Remettre les couleurs de départ' }).click();
    expect(await racine(page, '--bg')).toBe('#eceff3');
  });

  test('une valeur enregistrée douteuse ne casse rien', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tto.theme', 'custom');
      localStorage.setItem('tto.theme.custom', JSON.stringify({ fond: 'url(https://exemple.fr/x)', surface: '#fff', texte: 3, accent: '#abcdef' }));
    });
    await ouvrir(page);
    expect(await thème(page)).toBe('custom');
    expect(await racine(page, '--bg')).toBe('#eceff3'); // valeur de départ à la place de la valeur douteuse
    expect(await racine(page, '--accent')).toBe('#abcdef');
  });

  test('un thème inconnu enregistré est ignoré (thème du système)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tto.theme', 'n-importe-quoi'));
    await ouvrir(page);
    expect(await thème(page)).toBe('system');
  });

  test('se ferme au clavier (Échap) et reste utilisable dans les trois applications', async ({ page }) => {
    for (const app of ['text', 'sheet', 'slides']) {
      await installerFauxPont(page, { init: { type: 'new', app } });
      await page.goto('/');
      await expect(page.locator('#app > *').first()).toBeVisible();
      await envoyerMenu(page, 'view:themes');
      await expect(page.locator('.theme-dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.theme-dialog')).toHaveCount(0);
      await envoyerMenu(page, 'view:theme-foret');
      expect(await thème(page), app).toBe('foret');
    }
  });
});
