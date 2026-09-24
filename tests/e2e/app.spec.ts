import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function lancer(): Promise<{ app: ElectronApplication; page: Page; dossier: string }> {
  const dossier = mkdtempSync(join(tmpdir(), 'tto-e2e-'));
  const app = await electron.launch({
    // TTO_E2E_ARGS : options supplémentaires pour un environnement sans écran (voir la tâche 10 du plan).
    args: ['.', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...(process.env.TTO_E2E_ARGS?.split(' ').filter(Boolean) ?? [])],
    env: { ...process.env, TTO_USER_DATA: join(dossier, 'données') },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, dossier };
}

const titre = (app: ElectronApplication) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
const nombreDeFenêtres = (app: ElectronApplication) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

/** Remplace la boîte de dialogue native, qu'un test ne peut pas piloter, par une réponse toute prête. */
async function simuler(app: ElectronApplication, boîte: 'showSaveDialog' | 'showOpenDialog' | 'showMessageBox', réponse: object) {
  await app.evaluate(({ dialog }, [nom, valeur]) => {
    (dialog as unknown as Record<string, unknown>)[nom as string] = async () => valeur;
  }, [boîte, réponse] as const);
}

const cliquerMenu = (app: ElectronApplication, identifiant: string) =>
  app.evaluate(({ Menu }, id) => Menu.getApplicationMenu()!.getMenuItemById(id)!.click(), identifiant);

test('affiche l\'accueil puis un document où l\'on écrit, avec le titre de la fenêtre à jour', async () => {
  const { app, page } = await lancer();
  await expect(page.locator('.card')).toHaveCount(3);
  await expect(page.locator('.card-soon')).toHaveCount(2);
  expect(await titre(app)).toBe('Text to One');

  await page.locator('.card-active').click();
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('Bonjour le monde');
  await expect(page.locator('.status-count')).toContainText('3 mots');
  await expect.poll(() => titre(app)).toBe('• Document sans titre — Text to One');
  await simuler(app, 'showMessageBox', { response: 1 }); // « Ne pas enregistrer » à la fermeture
  await app.close();
});

test('enregistre un vrai fichier .tto, puis le rouvre dans une nouvelle fenêtre', async () => {
  const { app, page, dossier } = await lancer();
  const cible = join(dossier, 'Rapport été.tto');
  await page.locator('.card-active').click();
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('Contenu sauvegardé');

  await simuler(app, 'showSaveDialog', { canceled: false, filePath: cible });
  await cliquerMenu(app, 'file-save');
  await expect.poll(() => existsSync(cible)).toBe(true);
  expect(readFileSync(cible).subarray(0, 2).toString('latin1')).toBe('PK');
  await expect.poll(() => titre(app)).toBe('Rapport été — Text to One');

  await simuler(app, 'showOpenDialog', { canceled: false, filePaths: [cible] });
  const nouvelle = app.waitForEvent('window');
  await cliquerMenu(app, 'file-open');
  const page2 = await nouvelle;
  await expect(page2.locator('.ProseMirror')).toContainText('Contenu sauvegardé');
  expect(await nombreDeFenêtres(app)).toBe(2);
  await simuler(app, 'showMessageBox', { response: 1 });
  await app.close();
});

test('demande avant de fermer un document modifié, et garde la fenêtre si on annule', async () => {
  const { app, page } = await lancer();
  await page.locator('.card-active').click();
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('Pas encore enregistré');
  await expect.poll(() => titre(app)).toContain('•');

  await simuler(app, 'showMessageBox', { response: 2 }); // Annuler
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await page.waitForTimeout(500);
  expect(await nombreDeFenêtres(app)).toBe(1);

  await simuler(app, 'showMessageBox', { response: 1 }); // Ne pas enregistrer
  const fermée = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await fermée;
});

test("montre l'erreur quand le disque refuse, et garde le document modifié", async () => {
  const { app, page, dossier } = await lancer();
  await page.locator('.card-active').click();
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('Contenu');
  await simuler(app, 'showSaveDialog', { canceled: false, filePath: join(dossier, 'dossier-absent', 'a.tto') });
  await cliquerMenu(app, 'file-save');
  await expect(page.locator('.toast-error')).toContainText('introuvable');
  expect(await titre(app)).toContain('•');
  await simuler(app, 'showMessageBox', { response: 1 });
  await app.close();
});

test('exporte un vrai PDF', async () => {
  const { app, page, dossier } = await lancer();
  const cible = join(dossier, 'sortie.pdf');
  await page.locator('.card-active').click();
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('Texte du PDF');
  await simuler(app, 'showSaveDialog', { canceled: false, filePath: cible });
  await cliquerMenu(app, 'file-export-pdf');
  await expect.poll(() => existsSync(cible)).toBe(true);
  expect(readFileSync(cible).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await simuler(app, 'showMessageBox', { response: 1 });
  await app.close();
});

test("n'expose que le pont prévu à la page (pas d'accès à Node)", async () => {
  const { app, page } = await lancer();
  const exposé = await page.evaluate(() => ({
    require: typeof (window as any).require,
    process: typeof (window as any).process,
    fonctions: Object.keys((window as any).tto).sort(),
  }));
  expect(exposé.require).toBe('undefined');
  expect(exposé.process).toBe('undefined');
  expect(exposé.fonctions).toEqual(
    ['clearRecovery', 'closeWindow', 'exportPdf', 'init', 'listRecents', 'onMenu', 'onOpenRequest', 'openDialog', 'openExternal', 'readRecent', 'save', 'setWindowState', 'writeRecovery'].sort(),
  );
  await app.close();
});
