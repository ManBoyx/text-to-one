import { expect, test, type Page } from '@playwright/test';
import { packTto } from '../../src/formats/tto';
import { sampleDoc } from '../formats/sample-doc';
import { envoyerMenu, installerFauxPont, journal, règler } from './fake-bridge';

async function ouvrirÉditeur(page: Page, init: unknown = { type: 'new' }) {
  await installerFauxPont(page, { init });
  await page.goto('/');
}

async function taper(page: Page, texte: string) {
  await page.locator('.ProseMirror').click();
  await page.keyboard.type(texte);
}

test.describe('fichiers', () => {
  test('enregistre en .tto et marque le document non modifié', async ({ page }) => {
    await ouvrirÉditeur(page);
    await taper(page, 'Bonjour');
    await expect.poll(async () => (await journal(page)).états.at(-1)?.dirty).toBe(true);
    await envoyerMenu(page, 'file:save');
    await expect.poll(async () => (await journal(page)).enregistrements.length).toBe(1);
    const j = await journal(page);
    expect(j.enregistrements[0]).toMatchObject({ path: null, suggestedName: 'Document sans titre.tto', kind: 'tto', signature: 'PK' });
    await expect.poll(async () => (await journal(page)).états.at(-1)).toMatchObject({ name: 'essai', dirty: false, path: '/docs/essai.tto' });
    expect(j.effacés.length + (await journal(page)).effacés.length).toBeGreaterThan(0);
  });

  test('exporte dans les quatre formats', async ({ page }) => {
    await ouvrirÉditeur(page);
    await taper(page, 'Bonjour');
    const formats = ['docx', 'html', 'txt', 'md'];
    for (const [i, format] of formats.entries()) {
      await envoyerMenu(page, `file:export-${format}`);
      await expect.poll(async () => (await journal(page)).enregistrements.length).toBe(i + 1);
    }
    const j = await journal(page);
    expect(j.enregistrements.map((e) => e.kind)).toEqual(['docx', 'html', 'txt', 'md']);
    expect(j.enregistrements[0].signature).toBe('PK');
    expect(j.enregistrements.map((e) => e.suggestedName)).toEqual(['Document sans titre.docx', 'Document sans titre.html', 'Document sans titre.txt', 'Document sans titre.md']);
    await envoyerMenu(page, 'file:export-pdf');
    await expect.poll(async () => (await journal(page)).pdf).toEqual(['Document sans titre.pdf']);
  });

  test('ouvre le document envoyé par le processus principal', async ({ page }) => {
    await ouvrirÉditeur(page, { type: 'file', file: { path: '/docs/Bilan.tto', name: 'Bilan.tto', bytes: Array.from(packTto(sampleDoc)) } });
    await expect(page.locator('.ProseMirror h1')).toHaveText('Titre principal');
    await expect(page.locator('.ProseMirror table')).toHaveCount(1);
    await expect(page.locator('.ProseMirror img:not(.ProseMirror-separator)')).toHaveCount(1);
    await expect.poll(async () => (await journal(page)).états.at(-1)).toMatchObject({ name: 'Bilan', dirty: false, path: '/docs/Bilan.tto' });
  });

  test('un fichier invalide ramène à l\'accueil avec un message clair', async ({ page }) => {
    await ouvrirÉditeur(page, { type: 'file', file: { path: '/docs/faux.docx', name: 'faux.docx', bytes: [1, 2, 3] } });
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.toast-error')).toContainText("n'est pas un document Word valide");
  });

  test("« Enregistrer et fermer » ferme après l'enregistrement, et reste ouvert si on annule", async ({ page }) => {
    await ouvrirÉditeur(page);
    await taper(page, 'Bonjour');
    await règler(page, 'prochainEnregistrement', { status: 'cancelled' });
    await envoyerMenu(page, 'app:save-and-close');
    await expect.poll(async () => (await journal(page)).enregistrements.length).toBe(1);
    expect((await journal(page)).fermetures).toBe(0);

    await règler(page, 'prochainEnregistrement', { status: 'saved', path: '/docs/a.tto', name: 'a.tto' });
    await envoyerMenu(page, 'app:save-and-close');
    await expect.poll(async () => (await journal(page)).fermetures).toBe(1);
  });

  test("montre l'erreur quand l'enregistrement échoue, et garde le document modifié", async ({ page }) => {
    await ouvrirÉditeur(page);
    await taper(page, 'Bonjour');
    await règler(page, 'prochainEnregistrement', { status: 'error', message: 'Le disque est plein.' });
    await envoyerMenu(page, 'file:save');
    await expect(page.locator('.toast-error')).toContainText("Impossible d'enregistrer : Le disque est plein.");
    expect((await journal(page)).états.at(-1)?.dirty).toBe(true);
  });

  test('propose le document récupéré après une fermeture inattendue', async ({ page }) => {
    await ouvrirÉditeur(page, { type: 'recovered', id: 'abcdef12-0000', name: 'Brouillon', bytes: Array.from(packTto(sampleDoc)) });
    await expect(page.locator('.ProseMirror h1')).toHaveText('Titre principal');
    await expect.poll(async () => (await journal(page)).états.at(-1)).toMatchObject({ id: 'abcdef12-0000', name: 'Brouillon', dirty: true });
  });
});
