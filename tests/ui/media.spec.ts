import { expect, test, type Page } from '@playwright/test';
import { envoyerMenu, installerFauxPont } from './fake-bridge';

/** Une seconde de son (WAV, 8 kHz) : le navigateur de test sait le lire sans codec supplémentaire. */
function wav(secondes = 1): Buffer {
  const échantillons = 8000 * secondes;
  const tête = Buffer.alloc(44);
  tête.write('RIFF', 0);
  tête.writeUInt32LE(36 + échantillons * 2, 4);
  tête.write('WAVEfmt ', 8);
  tête.writeUInt32LE(16, 16);
  tête.writeUInt16LE(1, 20);
  tête.writeUInt16LE(1, 22);
  tête.writeUInt32LE(8000, 24);
  tête.writeUInt32LE(16000, 28);
  tête.writeUInt16LE(2, 32);
  tête.writeUInt16LE(16, 34);
  tête.write('data', 36);
  tête.writeUInt32LE(échantillons * 2, 40);
  const données = Buffer.alloc(échantillons * 2);
  for (let i = 0; i < échantillons; i++) données.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), i * 2);
  return Buffer.concat([tête, données]);
}
const SON = { name: 'ma-piste.wav', mimeType: 'audio/wav', buffer: wav() };
const FAUSSE_VIDÉO = { name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]) };

async function ouvrir(page: Page, app?: 'slides' | 'sheet') {
  await installerFauxPont(page, { init: app ? { type: 'new', app } : { type: 'new' } });
  await page.goto('/');
}
const choisir = async (page: Page, déclencheur: string, fichier: { name: string; mimeType: string; buffer: Buffer }) => {
  const [sélecteur] = await Promise.all([page.waitForEvent('filechooser'), page.locator(déclencheur).click()]);
  await sélecteur.setFiles(fichier);
};
/** La durée d'un lecteur : preuve que le fichier est lisible malgré la politique de sécurité de la page. */
const durée = (page: Page, sélecteur: string) =>
  page.locator(sélecteur).evaluate(
    (m: HTMLMediaElement) =>
      new Promise<number>((fin) => {
        if (m.readyState >= 1) return fin(m.duration);
        m.addEventListener('loadedmetadata', () => fin(m.duration), { once: true });
        m.addEventListener('error', () => fin(-1), { once: true });
      }),
  );

test.describe('sons et vidéos : texte', () => {
  test("le bouton insère un lecteur qui charge le son, avec son titre", async ({ page }) => {
    await ouvrir(page);
    await expect(page.locator('.ProseMirror')).toBeVisible();
    await page.locator('.ProseMirror').click();
    await choisir(page, '[data-action="insert:media"]', SON);
    const figure = page.locator('.ProseMirror figure.media-block');
    await expect(figure).toHaveCount(1);
    await expect(figure.locator('audio[controls]')).toHaveCount(1);
    await expect(figure.locator('figcaption')).toHaveText('ma-piste');
    expect(await durée(page, '.ProseMirror figure.media-block audio')).toBeGreaterThan(0.9);
  });

  test('le son se lance depuis son lecteur, sans que l’éditeur ne le gêne', async ({ page }) => {
    await ouvrir(page);
    await page.locator('.ProseMirror').click();
    await choisir(page, '[data-action="insert:media"]', SON);
    const lecteur = page.locator('.ProseMirror audio');
    await expect(lecteur).toHaveCount(1);
    await lecteur.evaluate((a: HTMLAudioElement) => a.play());
    await expect.poll(() => lecteur.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0);
    await lecteur.evaluate((a: HTMLAudioElement) => a.pause());
  });

  test('une vidéo a son lecteur vidéo', async ({ page }) => {
    await ouvrir(page);
    await page.locator('.ProseMirror').click();
    await envoyerMenu(page, 'insert:media').catch(() => undefined);
    await choisir(page, '[data-action="insert:media"]', FAUSSE_VIDÉO);
    await expect(page.locator('.ProseMirror figure.media-block video[controls]')).toHaveCount(1);
  });

  test('un fichier trop gros ou d’un type inconnu est refusé avec un message', async ({ page }) => {
    await ouvrir(page);
    await page.locator('.ProseMirror').click();
    await choisir(page, '[data-action="insert:media"]', { name: 'énorme.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(26 * 1024 * 1024) });
    await expect(page.locator('.toast-error')).toContainText('dépasse 25 Mo');
    await expect(page.locator('.ProseMirror figure.media-block')).toHaveCount(0);
    await page.locator('.toast-error').click();
    await choisir(page, '[data-action="insert:media"]', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
    await expect(page.locator('.toast-error')).toContainText("n'est pas pris en charge");
  });

  test('glisser un fichier sonore dans la page insère le lecteur', async ({ page }) => {
    await ouvrir(page);
    const zone = page.locator('.ProseMirror');
    await zone.click();
    await page.evaluate((octets) => {
      const fichier = new File([new Uint8Array(octets)], 'glissé.wav', { type: 'audio/wav' });
      const transfert = new DataTransfer();
      transfert.items.add(fichier);
      const cible = document.querySelector('.ProseMirror') as HTMLElement;
      const r = cible.getBoundingClientRect();
      cible.dispatchEvent(new DragEvent('drop', { dataTransfer: transfert, bubbles: true, cancelable: true, clientX: r.x + 40, clientY: r.y + 20 }));
    }, [...SON.buffer]);
    await expect(zone.locator('figure.media-block audio')).toHaveCount(1);
    await expect(zone.locator('figcaption')).toHaveText('glissé');
  });
});

test.describe('sons et vidéos : présentations', () => {
  test("l'objet a un bouton lecture qui lance le son, et la présentation donne les commandes", async ({ page }) => {
    await ouvrir(page, 'slides');
    await expect(page.locator('.stage-canvas')).toBeVisible();
    await choisir(page, '[data-action="slides:insert-media"]', SON);
    const objet = page.locator('.stage-canvas .obj-media');
    await expect(objet).toHaveCount(1);
    await expect(objet.locator('.media-title')).toHaveText('ma-piste');
    await expect(objet.locator('audio')).toHaveCount(1);
    expect(await durée(page, '.stage-canvas .obj-media audio')).toBeGreaterThan(0.9);
    await objet.locator('.media-play').click();
    await expect.poll(() => objet.locator('audio').evaluate((a: HTMLAudioElement) => !a.paused)).toBe(true);
    await expect(objet.locator('.media-play')).toHaveAttribute('aria-label', 'Mettre en pause');
    await objet.locator('.media-play').click();
    await expect.poll(() => objet.locator('audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
    // Le bouton sélectionne l'objet mais ne le déplace pas.
    await expect(page.locator('.sel')).toBeVisible();
  });

  test("les miniatures n'embarquent aucun lecteur", async ({ page }) => {
    await ouvrir(page, 'slides');
    await choisir(page, '[data-action="slides:insert-media"]', SON);
    await expect(page.locator('.thumb .obj-media')).toHaveCount(1);
    await expect(page.locator('.thumb audio, .thumb video')).toHaveCount(0);
  });

  test('en présentation : commandes natives ; un clic sur le lecteur ne change pas de diapositive', async ({ page }) => {
    await ouvrir(page, 'slides');
    await choisir(page, '[data-action="slides:insert-media"]', SON);
    await page.locator('[data-action="slides:new-slide"]').click();
    await page.locator('.thumb').first().click();
    await envoyerMenu(page, 'slides:present');
    const présent = page.locator('.present');
    await expect(présent.locator('audio[controls]')).toHaveCount(1);
    await expect(présent.locator('.present-count')).toContainText('1');
    await présent.locator('audio').click({ force: true });
    await expect(présent.locator('.present-count')).toContainText('1 / 2');
    // Redimensionner la fenêtre ne relance pas la diapositive : le lecteur reste le même élément.
    await présent.locator('audio').evaluate((a) => ((a as HTMLElement).dataset.marque = 'oui'));
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await expect(présent.locator('audio[data-marque="oui"]')).toHaveCount(1);
    await présent.locator('audio').evaluate((a) => a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await expect(présent).toHaveCount(0);
  });
});

test.describe('sons et vidéos : tableur', () => {
  test('une pastille apparaît dans la cellule ; un clic ouvre le lecteur, « Retirer » l’enlève', async ({ page }) => {
    await ouvrir(page, 'sheet');
    await expect(page.locator('.sg')).toBeVisible();
    await page.locator('.sg-cell[data-r="0"][data-c="0"]').click();
    await choisir(page, '[data-action="sheet:insert-media"]', SON);
    const pastille = page.locator('.sg-cell[data-r="0"][data-c="0"] .sg-media');
    await expect(pastille).toHaveCount(1);
    await expect(pastille).toHaveAttribute('aria-label', 'Son : ma-piste');
    await pastille.click();
    const lecteur = page.locator('.sh-player');
    await expect(lecteur).toBeVisible();
    await expect(lecteur.locator('.sh-player-title')).toContainText('A1');
    expect(await durée(page, '.sh-player audio')).toBeGreaterThan(0.9);
    await lecteur.getByRole('button', { name: 'Retirer' }).click();
    await expect(lecteur).toHaveCount(0);
    await expect(page.locator('.sg-media')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.sg-media')).toHaveCount(1);
  });

  test('le lecteur se ferme avec Échap et quand on change de cellule ; le bouton rouvre sur une cellule pourvue', async ({ page }) => {
    await ouvrir(page, 'sheet');
    await page.locator('.sg-cell[data-r="0"][data-c="0"]').click();
    await choisir(page, '[data-action="sheet:insert-media"]', SON);
    await page.locator('[data-action="sheet:insert-media"]').click(); // la cellule a un son : ouvre le lecteur
    await expect(page.locator('.sh-player')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sh-player')).toHaveCount(0);
    await page.locator('.sg-cell[data-r="0"][data-c="0"] .sg-media').click();
    await expect(page.locator('.sh-player')).toBeVisible();
    await page.locator('.sg-cell[data-r="3"][data-c="2"]').click();
    await expect(page.locator('.sh-player')).toHaveCount(0);
  });

  test("l'export Excel prévient que les sons et vidéos n'y sont pas", async ({ page }) => {
    await ouvrir(page, 'sheet');
    await page.locator('.sg-cell[data-r="0"][data-c="0"]').click();
    await choisir(page, '[data-action="sheet:insert-media"]', SON);
    await envoyerMenu(page, 'file:export-xlsx');
    await expect(page.locator('.toast-warning')).toContainText('ne sont pas inclus');
  });
});
