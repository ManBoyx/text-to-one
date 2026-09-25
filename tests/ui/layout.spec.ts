import { expect, test, type Page } from '@playwright/test';
import { installerFauxPont } from './fake-bridge';

const LARGEURS = [1440, 1024, 640];

async function sansDébordement(page: Page) {
  const dépasse = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(dépasse, 'la page ne doit pas défiler horizontalement').toBe(false);
}

for (const largeur of LARGEURS) {
  test.describe(`fenêtre de ${largeur} pixels`, () => {
    test.use({ viewport: { width: largeur, height: 800 } });

    test("l'accueil tient dans la fenêtre", async ({ page }) => {
      await installerFauxPont(page, { recents: [{ path: '/docs/a très long nom de document qui pourrait tout déborder si on n\'y prenait pas garde.tto', name: 'a très long nom de document qui pourrait tout déborder si on n\'y prenait pas garde.tto' }] });
      await page.goto('/');
      await expect(page.locator('.card-active').first()).toBeVisible();
      await sansDébordement(page);
    });

    test("l'éditeur tient dans la fenêtre, barre d'outils comprise", async ({ page }) => {
      await installerFauxPont(page, { init: { type: 'new' } });
      await page.goto('/');
      await expect(page.locator('.toolbar')).toBeVisible();
      await sansDébordement(page);
      const dehors = await page.evaluate(() => [...document.querySelectorAll('.toolbar .tb-btn, .toolbar select')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length);
      expect(dehors).toBe(0);
      await expect(page.locator('.statusbar')).toBeVisible();
    });
  });
}
