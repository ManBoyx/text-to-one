import { expect, test } from '@playwright/test';
import { envoyerMenu, installerFauxPont } from './fake-bridge';

test('recherche puis remplace dans le document', async ({ page }) => {
  await installerFauxPont(page, { init: { type: 'new' } });
  await page.goto('/');
  const zone = page.locator('.ProseMirror');
  await zone.click();
  await page.keyboard.type('chat chat chien');

  await envoyerMenu(page, 'edit:find');
  await expect(page.locator('.findbar')).toBeVisible();
  await page.locator('.find-input').first().fill('chat');
  await expect(page.locator('.find-count')).toHaveText('1 sur 2');
  await expect(zone.locator('.search-match')).toHaveCount(2);
  await page.locator('.find-input').first().press('Enter');
  await expect(page.locator('.find-count')).toHaveText('2 sur 2');

  await envoyerMenu(page, 'edit:replace');
  await page.getByPlaceholder('Remplacer par').fill('lion');
  await page.getByRole('button', { name: 'Tout remplacer' }).click();
  await expect(zone).toContainText('lion lion chien');
  await expect(page.locator('.find-count')).toHaveText('Aucun résultat');

  await page.locator('.find-input').first().press('Escape');
  await expect(page.locator('.findbar')).toBeHidden();
  await expect(zone.locator('.search-match')).toHaveCount(0);
});
