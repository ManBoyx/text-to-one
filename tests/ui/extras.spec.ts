import { expect, test, type Page } from '@playwright/test';
import { envoyerMenu, installerFauxPont } from './fake-bridge';

async function ouvrir(page: Page) {
  await installerFauxPont(page, { init: { type: 'new' } });
  await page.goto('/');
  await expect(page.locator('.ProseMirror')).toBeVisible();
}

test.describe('fonctions en plus du texte', () => {
  test('la date du jour s’écrit en toutes lettres, depuis le bouton et depuis le menu', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-26T10:00:00') });
    await ouvrir(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.locator('[data-action="insert:date"]').click();
    await expect(zone).toContainText('26 septembre 2026');
    await page.keyboard.type(' et ');
    await envoyerMenu(page, 'insert:date');
    await expect(zone).toContainText('26 septembre 2026 et 26 septembre 2026');
  });

  test('le sommaire liste les titres, emboîtés, sous un intitulé en gras', async ({ page }) => {
    await ouvrir(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('# Introduction');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Du texte.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Contexte');
    await page.keyboard.press('Enter');
    await page.keyboard.type('# Conclusion');
    await page.keyboard.press('Enter');
    await page.locator('[data-action="insert:toc"]').click();
    await expect(zone.locator('strong', { hasText: 'Sommaire' })).toHaveCount(1);
    await expect(zone.locator('ul > li')).toHaveCount(3);
    await expect(zone.locator('ul ul > li')).toHaveText('Contexte');
    await expect(zone.locator('ul > li').first().locator('> p')).toHaveText('Introduction');
  });

  test("sans titre, le sommaire l'explique au lieu de n'insérer rien", async ({ page }) => {
    await ouvrir(page);
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('Juste du texte');
    await page.locator('[data-action="insert:toc"]').click();
    await expect(page.locator('.toast-info')).toContainText('Aucun titre');
    await expect(page.locator('.ProseMirror ul')).toHaveCount(0);
  });

  test('le mode concentration cache les barres, et Échap ou le bouton les rendent', async ({ page }) => {
    await ouvrir(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('Texte');
    await expect(page.locator('.toolbar')).toBeVisible();
    await envoyerMenu(page, 'view:focus');
    await expect(page.locator('.toolbar')).toBeHidden();
    await expect(page.locator('.statusbar')).toBeHidden();
    await expect(page.locator('.focus-exit')).toBeVisible();
    await page.keyboard.type(' encore'); // on continue d'écrire au clavier
    await expect(zone).toContainText('Texte encore');
    await page.keyboard.press('Escape');
    await expect(page.locator('.toolbar')).toBeVisible();
    await expect(page.locator('.focus-exit')).toBeHidden();
    await envoyerMenu(page, 'view:focus');
    await page.locator('.focus-exit').click();
    await expect(page.locator('.statusbar')).toBeVisible();
  });
});
