import { expect, test, type Page } from '@playwright/test';
import { GIF_1PX, PNG_1PX } from '../formats/sample-doc';
import { envoyerMenu, installerFauxPont } from './fake-bridge';

async function ouvrirÉditeur(page: Page) {
  await installerFauxPont(page, { init: { type: 'new' } });
  await page.goto('/');
  await expect(page.locator('.ProseMirror')).toBeVisible();
}

const octetsDe = (adresse: string) => Buffer.from(adresse.split(',')[1], 'base64');
/** Laisse passer deux images : le temps que l'éditeur prenne en compte une sélection faite au clavier. */
const laisserLeNavigateurRéagir = (page: Page) => page.evaluate(() => new Promise((fin) => requestAnimationFrame(() => requestAnimationFrame(() => fin(null)))));
/** Les vraies images du document : ProseMirror ajoute aussi une image « séparateur » invisible. */
const IMAGES = '.ProseMirror img:not(.ProseMirror-separator)';

test.describe('éditeur', () => {
  test('gras, titre, alignement et liste depuis la barre d\'outils', async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('Bonjour le monde');
    await page.keyboard.press('Control+A');
    await page.locator('[data-action="format:bold"]').click();
    await expect(zone.locator('strong')).toHaveText('Bonjour le monde');
    await page.locator('.tb-style').selectOption('h2');
    await expect(zone.locator('h2')).toHaveCount(1);
    await page.locator('[data-action="format:align-center"]').click();
    await expect(zone.locator('h2')).toHaveAttribute('style', /text-align: center/);
    await page.locator('.tb-style').selectOption('p');
    await zone.locator('p').first().click(); // l'éditeur ajoute un paragraphe vide après un titre : on n'en veut qu'un
    await page.locator('[data-action="format:bullet-list"]').click();
    await expect(zone.locator('ul li')).toHaveCount(1);
    await expect(page.locator('.statusbar')).toContainText('3 mots');
  });

  test('police, taille et interligne', async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('Texte');
    await page.keyboard.press('Control+A');
    await page.locator('.tb-font').selectOption({ label: 'Georgia' });
    await page.locator('.tb-size').selectOption('18pt');
    await page.locator('.tb-lineheight').selectOption('1.5');
    await expect(zone.locator('span[style*="Georgia"]')).toHaveCount(1);
    await expect(zone.locator('span[style*="18pt"]')).toHaveCount(1);
    await expect(zone.locator('p')).toHaveAttribute('style', /line-height: 1.5/);
    await expect(page.locator('.tb-size')).toHaveValue('18pt');
  });

  test("insère un tableau puis ajoute une ligne", async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.locator('.tb-table').click();
    await page.getByRole('button', { name: 'Insérer un tableau 3 × 3' }).click();
    await expect(zone.locator('td, th')).toHaveCount(9);
    await page.locator('.tb-table').click();
    await page.getByRole('button', { name: 'Ajouter une ligne en dessous' }).click();
    await expect(zone.locator('tr')).toHaveCount(4);
  });

  test('insère un lien avec la fenêtre de dialogue, et refuse une adresse dangereuse', async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.locator('[data-action="insert:link"]').click();
    await expect(page.locator('dialog.dialog[open]')).toBeVisible();
    await page.locator('.dialog-input').fill('exemple.fr');
    await page.locator('.dialog .btn-primary').click();
    await expect(zone.locator('a[href="https://exemple.fr"]')).toHaveCount(1);

    await page.locator('[data-action="insert:link"]').click();
    await page.locator('.dialog-input').fill('javascript:alert(1)');
    await page.locator('.dialog .btn-primary').click();
    await expect(page.locator('.toast-error')).toContainText("Cette adresse n'est pas autorisée");
  });

  test('insère une image choisie sur le disque', async ({ page }) => {
    await ouvrirÉditeur(page);
    await page.locator('.ProseMirror').click();
    const [choix] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-action="insert:image"]').click()]);
    await choix.setFiles({ name: 'point.png', mimeType: 'image/png', buffer: octetsDe(PNG_1PX) });
    await expect(page.locator(IMAGES)).toHaveCount(1);
    await expect(page.locator(IMAGES)).toHaveAttribute('src', /^data:image\/png;base64,/);
  });

  test('accepte une image déposée sur la feuille', async ({ page }) => {
    await ouvrirÉditeur(page);
    await page.locator('.ProseMirror').click();
    await page.evaluate(async (adresse) => {
      const réponse = await fetch(adresse);
      const fichier = new File([await réponse.blob()], 'goutte.gif', { type: 'image/gif' });
      const transfert = new DataTransfer();
      transfert.items.add(fichier);
      const zone = document.querySelector('.ProseMirror') as HTMLElement;
      const boîte = zone.getBoundingClientRect();
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: transfert, bubbles: true, cancelable: true, clientX: boîte.left + 10, clientY: boîte.top + 10 }));
    }, GIF_1PX);
    await expect(page.locator(IMAGES)).toHaveCount(1);
  });

  test('nettoie le contenu collé et ne charge aucune image distante', async ({ page }) => {
    const externes: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://localhost') && !r.url().startsWith('data:')) externes.push(r.url());
    });
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.evaluate(() => {
      const transfert = new DataTransfer();
      transfert.setData(
        'text/html',
        '<p>Bonjour <b>monde</b></p><script>window.__pirate=1</script><img src="https://exemple.fr/pixel.png">' +
          '<a href="javascript:window.__pirate=2">clic</a><p onclick="window.__pirate=3" style="position:fixed">fin</p>',
      );
      transfert.setData('text/plain', 'Bonjour monde');
      document.querySelector('.ProseMirror')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfert, bubbles: true, cancelable: true }));
    });
    await expect(zone).toContainText('Bonjour monde');
    await expect(zone.locator('script, img, iframe')).toHaveCount(0);
    await expect(zone.locator('a[href^="javascript"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__pirate)).toBeUndefined();
    expect(externes).toEqual([]);
  });

  test('zoom et compteurs', async ({ page }) => {
    await ouvrirÉditeur(page);
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('un deux trois');
    await expect(page.locator('.status-count')).toHaveText('3 mots · 13 caractères');
    await page.locator('.zoom-in').click();
    await expect(page.locator('.zoom-label')).toHaveText('110 %');
    await expect(page.locator('.sheet')).toHaveCSS('zoom', '1.1');
    await page.locator('.zoom-label').click();
    await expect(page.locator('.zoom-label')).toHaveText('100 %');
  });

  test('thème sombre par le menu, et retour au thème automatique', async ({ page }) => {
    await ouvrirÉditeur(page);
    await envoyerMenu(page, 'view:theme-dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.sheet')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await envoyerMenu(page, 'view:theme-system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  });

  test('les actions des menus fonctionnent : gras et citation', async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('Texte');
    await page.keyboard.press('Control+A');
    await laisserLeNavigateurRéagir(page); // l'éditeur apprend la nouvelle sélection un instant après la touche
    await envoyerMenu(page, 'format:bold');
    await envoyerMenu(page, 'format:blockquote');
    await expect(zone.locator('blockquote strong')).toHaveText('Texte');
  });

  test('les actions des menus fonctionnent : saut de page, puis annuler', async ({ page }) => {
    await ouvrirÉditeur(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.keyboard.type('Texte');
    await envoyerMenu(page, 'insert:page-break');
    await expect(zone.locator('.page-break')).toHaveCount(1);
    await envoyerMenu(page, 'edit:undo');
    await expect(zone.locator('.page-break')).toHaveCount(0);
  });
});
