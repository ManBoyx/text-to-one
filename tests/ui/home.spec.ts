import { expect, test } from '@playwright/test';
import { installerFauxPont } from './fake-bridge';

test.describe('écran d\'accueil', () => {
  test.beforeEach(async ({ page }) => {
    await installerFauxPont(page, { recents: [{ path: '/docs/Rapport été 2025.tto', name: 'Rapport été 2025.tto' }] });
    await page.goto('/');
  });

  test('présente les trois applications de la suite, toutes disponibles', async ({ page }) => {
    await expect(page.locator('.card')).toHaveCount(3);
    await expect(page.locator('.card-active')).toHaveCount(3);
    await expect(page.locator('.card-soon')).toHaveCount(0);
    const titres = await page.locator('.card-title').allTextContents();
    expect(titres).toEqual(['Texte', 'Tableur', 'Présentations']);
    await expect(page.locator('.home-tagline')).toContainText('texte, tableur et présentations');
  });

  test('liste les documents récents', async ({ page }) => {
    await expect(page.locator('.recent-item')).toHaveCount(1);
    await expect(page.locator('.recent-name')).toHaveText('Rapport été 2025.tto');
  });

  test('ouvre un nouveau document texte, un tableur ou une présentation selon la carte', async ({ page }) => {
    await page.locator('.card', { hasText: 'Tableur' }).click();
    await expect(page.locator('.sg')).toBeVisible();
    await page.goto('/');
    await page.locator('.card', { hasText: 'Présentations' }).click();
    await expect(page.locator('.stage')).toBeVisible();
    await page.goto('/');
    await page.locator('.card', { hasText: 'Texte' }).click();
    await expect(page.locator('.toolbar')).toBeVisible();
    await expect(page.locator('.ProseMirror')).toBeFocused();
    await expect(page.locator('.statusbar')).toContainText('0 mot');
  });

  test('sans document récent, le dit', async ({ page }) => {
    await installerFauxPont(page);
    await page.goto('/');
    await expect(page.locator('.recent-empty')).toHaveText('Aucun document récent pour le moment.');
  });
});
