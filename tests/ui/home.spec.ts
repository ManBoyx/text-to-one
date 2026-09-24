import { expect, test } from '@playwright/test';
import { installerFauxPont } from './fake-bridge';

test.describe('écran d\'accueil', () => {
  test.beforeEach(async ({ page }) => {
    await installerFauxPont(page, { recents: [{ path: '/docs/Rapport été 2025.tto', name: 'Rapport été 2025.tto' }] });
    await page.goto('/');
  });

  test('présente trois applications dont deux annoncées « bientôt »', async ({ page }) => {
    await expect(page.locator('.card')).toHaveCount(3);
    await expect(page.locator('.card-active')).toContainText('Texte');
    const bientôt = page.locator('.card-soon');
    await expect(bientôt).toHaveCount(2);
    await expect(bientôt.nth(0)).toContainText('Tableur');
    await expect(bientôt.nth(1)).toContainText('Présentations');
    for (const i of [0, 1]) {
      await expect(bientôt.nth(i)).toContainText('Bientôt');
      await expect(bientôt.nth(i)).toHaveAttribute('aria-disabled', 'true');
    }
    await expect(page.locator('.home-tagline')).toContainText('arrivent bientôt');
  });

  test('liste les documents récents', async ({ page }) => {
    await expect(page.locator('.recent-item')).toHaveCount(1);
    await expect(page.locator('.recent-name')).toHaveText('Rapport été 2025.tto');
  });

  test('ouvre un nouveau document texte', async ({ page }) => {
    await page.locator('.card-active').click();
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
