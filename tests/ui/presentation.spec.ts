import { expect, test, type Page } from '@playwright/test';
import { nouvelleDiapo, présentationParDéfaut, type SlidesDoc } from '../../src/formats/slides/model';
import { packSlides } from '../../src/formats/slides/ttp';
import { PNG_1PX } from '../formats/sample-doc';
import { envoyerMenu, installerFauxPont, journal } from './fake-bridge';

const objets = (page: Page) => page.locator('.stage-canvas .obj');
const objet = (page: Page, i: number) => objets(page).nth(i);

async function ouvrirPrésentation(page: Page, init: unknown = { type: 'new', app: 'slides' }) {
  await installerFauxPont(page, { init });
  await page.goto('/');
  await expect(page.locator('.stage-canvas')).toBeVisible();
}

const géométrie = (page: Page, i: number) => objet(page, i).evaluate((e) => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: parseFloat(e.style.width), h: parseFloat(e.style.height) }));

test.describe('présentations', () => {
  test('commence par une diapositive de titre et le dit dans la barre d\'état', async ({ page }) => {
    await ouvrirPrésentation(page);
    await expect(page.locator('.thumb')).toHaveCount(1);
    await expect(objets(page)).toHaveCount(2);
    await expect(objet(page, 0)).toHaveText('Titre de la présentation');
    await expect(page.locator('.status-count')).toHaveText('Diapositive 1 sur 1 · 2 objets');
    await expect.poll(async () => (await journal(page)).états.at(-1)).toMatchObject({ app: 'slides', name: 'Document sans titre', dirty: false });
  });

  test('sélectionne, déplace au clavier et à la souris, redimensionne, supprime', async ({ page }) => {
    await ouvrirPrésentation(page);
    await objet(page, 0).click();
    await expect(page.locator('.sel')).toBeVisible();
    const départ = await géométrie(page, 0);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    expect(await géométrie(page, 0)).toMatchObject({ x: départ.x + 1, y: départ.y + 10 });

    const boîte = (await objet(page, 0).boundingBox())!;
    await page.mouse.move(boîte.x + boîte.width / 2, boîte.y + boîte.height / 2);
    await page.mouse.down();
    await page.mouse.move(boîte.x + boîte.width / 2 + 60, boîte.y + boîte.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    const déplacé = await géométrie(page, 0);
    expect(déplacé.x).toBeGreaterThan(départ.x + 30);
    expect(déplacé.y).toBeGreaterThan(départ.y + 20);

    const poignée = (await page.locator('.handle-se').boundingBox())!;
    await page.mouse.move(poignée.x + poignée.width / 2, poignée.y + poignée.height / 2);
    await page.mouse.down();
    await page.mouse.move(poignée.x + 80, poignée.y + 40, { steps: 5 });
    await page.mouse.up();
    const agrandi = await géométrie(page, 0);
    expect(agrandi.w).toBeGreaterThan(déplacé.w + 40);
    expect(agrandi.h).toBeGreaterThan(déplacé.h + 15);

    await page.keyboard.press('Delete');
    await expect(objets(page)).toHaveCount(1);
    await expect(page.locator('.sel')).toBeHidden();
    await objet(page, 0).click();
    await page.mouse.click(5, 300); // un clic dans le vide désélectionne
  });

  test('modifie le texte sur place : double-clic, Entrée, Échap', async ({ page }) => {
    await ouvrirPrésentation(page);
    await objet(page, 0).dblclick();
    await expect(objet(page, 0)).toHaveAttribute('contenteditable', 'plaintext-only');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Mon nouveau titre');
    await page.keyboard.press('Escape');
    await expect(objet(page, 0)).toHaveAttribute('contenteditable', 'false');
    await expect(objet(page, 0)).toHaveText('Mon nouveau titre');
    await expect(page.locator('.thumb .obj-text').first()).toHaveText('Mon nouveau titre');
    await expect.poll(async () => (await journal(page)).états.at(-1)?.dirty).toBe(true);
    await objet(page, 1).click();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('ligne un');
    await page.keyboard.press('Enter');
    await page.keyboard.type('ligne deux');
    await page.locator('.sl-panel').click({ position: { x: 100, y: 400 } }); // la perte de focus valide
    await expect(objet(page, 1)).toContainText('ligne un');
    await expect(objet(page, 1)).toContainText('ligne deux');
  });

  test('insère texte, rectangle, ellipse et met en forme', async ({ page }) => {
    await ouvrirPrésentation(page);
    await page.locator('[data-action="slides:insert-rect"]').click();
    await page.locator('[data-action="slides:insert-ellipse"]').click();
    await page.locator('[data-action="slides:insert-text"]').click();
    await expect(objets(page)).toHaveCount(5);
    const texte = objet(page, 4);
    await expect(texte).toHaveText('Texte');
    await page.locator('[data-action="format:bold"]').click();
    await expect(texte).toHaveCSS('font-weight', '700');
    await page.locator('[data-action="format:italic"]').click();
    await expect(texte).toHaveCSS('font-style', 'italic');
    await page.locator('[data-action="format:underline"]').click();
    await expect(texte).toHaveCSS('text-decoration-line', 'underline');
    await page.locator('[data-action="format:align-center"]').click();
    await expect(texte).toHaveCSS('text-align', 'center');
    await page.locator('.sl-size').selectOption('48');
    await expect(texte).toHaveCSS('font-size', '48px');
    await page.locator('.tb-text-color').click();
    await page.getByRole('button', { name: '#e03131' }).click();
    await expect(texte).toHaveCSS('color', 'rgb(224, 49, 49)');

    await objet(page, 2).click({ position: { x: 25, y: 10 } }); // près du coin du rectangle : hors du texte, de l'ellipse et des poignées
    await page.locator('.tb-fill-color').click();
    await page.getByRole('button', { name: '#2f9e44' }).click();
    await expect(objet(page, 2)).toHaveCSS('background-color', 'rgb(47, 158, 68)');
    await page.locator('.tb-stroke-color').click();
    await page.getByRole('button', { name: '#000000' }).click();
    await expect(objet(page, 2)).toHaveCSS('border-top-width', '2px');
    await expect(objet(page, 3)).toHaveCSS('border-radius', '50%');

    await objet(page, 2).click({ position: { x: 25, y: 10 } });
    await page.locator('[data-action="slides:bring-front"]').click();
    await expect(objet(page, 4)).toHaveCSS('background-color', 'rgb(47, 158, 68)');
    await page.locator('[data-action="slides:duplicate-object"]').click();
    await expect(objets(page)).toHaveCount(6);
    await page.locator('[data-action="slides:delete-object"]').click();
    await expect(objets(page)).toHaveCount(5);
  });

  test('gère les diapositives : ajouter, dupliquer, ordonner, supprimer, naviguer', async ({ page }) => {
    await ouvrirPrésentation(page);
    await page.locator('[data-action="slides:new-slide"]').click();
    await expect(page.locator('.thumb')).toHaveCount(2);
    await expect(page.locator('.thumb.is-current')).toHaveAttribute('data-index', '1');
    await expect(objets(page)).toHaveCount(2);
    await expect(objet(page, 0)).toHaveText('Titre');
    await page.locator('.sl-layout').selectOption('blank');
    await page.locator('[data-action="slides:new-slide"]').click();
    await expect(objets(page)).toHaveCount(0);
    await expect(page.locator('.status-count')).toHaveText('Diapositive 3 sur 3 · 0 objet');
    await page.locator('[data-action="slides:move-up"]').click();
    await expect(page.locator('.thumb.is-current')).toHaveAttribute('data-index', '1');
    await expect(page.locator('[data-action="slides:move-up"]').first()).toBeEnabled();
    await page.locator('[data-action="slides:duplicate-slide"]').click();
    await expect(page.locator('.thumb')).toHaveCount(4);
    await page.locator('.thumb').first().click();
    await expect(page.locator('.thumb.is-current')).toHaveAttribute('data-index', '0');
    await expect(objet(page, 0)).toHaveText('Titre de la présentation');
    await page.locator('.stage').focus();
    await page.keyboard.press('PageDown');
    await expect(page.locator('.thumb.is-current')).toHaveAttribute('data-index', '1');
    await page.keyboard.press('PageUp');
    await expect(page.locator('.thumb.is-current')).toHaveAttribute('data-index', '0');
    await page.locator('[data-action="slides:delete-slide"]').click();
    await expect(page.locator('.thumb')).toHaveCount(3);
    for (let i = 0; i < 3; i++) await page.locator('[data-action="slides:delete-slide"]').click();
    await expect(page.locator('.thumb')).toHaveCount(1); // il reste toujours au moins une diapositive
    await expect(objets(page)).toHaveCount(0);
  });

  test('annule et rétablit', async ({ page }) => {
    await ouvrirPrésentation(page);
    await page.locator('[data-action="slides:insert-rect"]').click();
    await expect(objets(page)).toHaveCount(3);
    await page.locator('.stage').focus();
    await page.keyboard.press('Control+z');
    await expect(objets(page)).toHaveCount(2);
    await page.keyboard.press('Control+y');
    await expect(objets(page)).toHaveCount(3);
    await page.locator('[data-action="edit:undo"]').click();
    await expect(objets(page)).toHaveCount(2);
    await page.locator('[data-action="slides:new-slide"]').click();
    await envoyerMenu(page, 'edit:undo');
    await expect(page.locator('.thumb')).toHaveCount(1);
  });

  test("change le fond de la diapositive", async ({ page }) => {
    await ouvrirPrésentation(page);
    await page.locator('.tb-background').click();
    await page.getByRole('button', { name: '#1971c2' }).click();
    await expect(page.locator('.stage-canvas')).toHaveCSS('background-color', 'rgb(25, 113, 194)');
    await expect(page.locator('.thumb .slide').first()).toHaveCSS('background-color', 'rgb(25, 113, 194)');
  });

  test('insère une image choisie sur le disque', async ({ page }) => {
    await ouvrirPrésentation(page);
    const [choix] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-action="slides:insert-image"]').click()]);
    await choix.setFiles({ name: 'point.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1PX.split(',')[1], 'base64') });
    await expect(page.locator('.stage-canvas .obj-image img')).toHaveCount(1);
    await expect(page.locator('.stage-canvas .obj-image img')).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect(page.locator('.sel')).toBeVisible();
  });

  test('présente en plein écran : avancer, reculer, quitter', async ({ page }) => {
    await ouvrirPrésentation(page);
    await page.locator('[data-action="slides:new-slide"]').click();
    await page.locator('.thumb').first().click();
    await page.locator('[data-action="slides:present"]').click();
    await expect(page.locator('.present')).toBeVisible();
    await expect(page.locator('.present-count')).toHaveText('1 / 2');
    await expect(page.locator('.present .obj')).toHaveCount(2);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.present-count')).toHaveText('2 / 2');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.present-count')).toHaveText('1 / 2');
    await page.keyboard.press('End');
    await expect(page.locator('.present-count')).toHaveText('2 / 2');
    await page.keyboard.press('Escape');
    await expect(page.locator('.present')).toHaveCount(0);
    await envoyerMenu(page, 'slides:present');
    await page.locator('.present').click();
    await page.locator('.present').click();
    await expect(page.locator('.present')).toHaveCount(0); // avancer après la dernière diapositive ferme
  });

  test('enregistre en .ttp, exporte en PowerPoint et prépare le PDF', async ({ page }) => {
    await ouvrirPrésentation(page);
    await page.locator('[data-action="slides:new-slide"]').click();
    await envoyerMenu(page, 'file:save');
    await envoyerMenu(page, 'file:export-pptx');
    await expect.poll(async () => (await journal(page)).enregistrements.length).toBe(2);
    const j = await journal(page);
    expect(j.enregistrements.find((e) => e.kind === 'ttp')).toMatchObject({ suggestedName: 'Document sans titre.ttp', signature: 'PK' });
    expect(j.enregistrements.find((e) => e.kind === 'pptx')?.signature).toBe('PK');
    await envoyerMenu(page, 'file:export-pdf');
    await expect.poll(async () => (await journal(page)).pdf).toEqual(['essai.pdf']); // le document a été enregistré sous « essai » par le faux pont
    await expect(page.locator('.print-slide')).toHaveCount(0); // le conteneur d'impression est vidé après l'export
  });

  test('ouvre une présentation .ttp avec ses images', async ({ page }) => {
    const doc: SlidesDoc = {
      slides: [
        { ...nouvelleDiapo('blank'), id: 's1', background: '#ffffff', objects: [{ id: 'i1', type: 'image', x: 10, y: 10, w: 100, h: 100, src: PNG_1PX, alt: 'un pixel' }] },
        nouvelleDiapo('content'),
      ],
    };
    await ouvrirPrésentation(page, { type: 'file', file: { path: '/d/Expo.ttp', name: 'Expo.ttp', bytes: Array.from(packSlides(doc)) } });
    await expect(page.locator('.thumb')).toHaveCount(2);
    await expect(page.locator('.stage-canvas .obj-image img')).toHaveAttribute('src', PNG_1PX);
    await expect.poll(async () => (await journal(page)).états.at(-1)).toMatchObject({ app: 'slides', name: 'Expo', dirty: false, path: '/d/Expo.ttp' });
  });

  test("un fichier PowerPoint ou invalide ramène à l'accueil avec un message clair", async ({ page }) => {
    await installerFauxPont(page, { init: { type: 'file', file: { path: '/d/x.ttp', name: 'x.ttp', bytes: [1, 2, 3] } } });
    await page.goto('/');
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.toast-error')).toContainText("n'est pas une présentation Text to One valide");
  });

  test('ne déborde pas dans une fenêtre étroite', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await ouvrirPrésentation(page);
    const dépasse = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(dépasse).toBe(false);
    const dehors = await page.evaluate(() => [...document.querySelectorAll('.toolbar .tb-btn, .toolbar select')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length);
    expect(dehors).toBe(0);
    const scène = (await page.locator('.stage').boundingBox())!;
    const cadre = (await page.locator('.stage-frame').boundingBox())!;
    expect(cadre.x).toBeGreaterThanOrEqual(scène.x - 1);
    expect(cadre.x + cadre.width).toBeLessThanOrEqual(scène.x + scène.width + 1);
    void présentationParDéfaut;
  });
});
