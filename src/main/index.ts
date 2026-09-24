import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { fr } from '../renderer/fr';
import { boîteOuvrir, enregistrerIpc, lireDocument, type ContexteIpc } from './ipc';
import { construireMenu } from './menu';
import { RecentsStore, fileStorage } from './recents';
import { RecoveryStore } from './recovery';
import { créerFenêtre, envoyerAction, fenêtreCible, initialiserFenêtres, ouvrirDemande } from './windows';

const URL_DÉPÔT = 'https://github.com/ManBoyx/text-to-one';

// Les tests de l'application isolent ses données dans un dossier à part.
if (process.env.TTO_USER_DATA) app.setPath('userData', process.env.TTO_USER_DATA);
app.setAppUserModelId('io.github.manboyx.texttoone');

/** Les fichiers .tto et .docx donnés en argument (double-clic dans l'explorateur). */
async function cheminsDocuments(argv: string[]): Promise<string[]> {
  const candidats = argv.slice(process.defaultApp ? 2 : 1).filter((a) => !a.startsWith('-') && /\.(tto|docx)$/i.test(a));
  const existants: string[] = [];
  for (const chemin of candidats) {
    if (await fs.stat(chemin).then((s) => s.isFile(), () => false)) existants.push(chemin);
  }
  return existants;
}

async function démarrer(): Promise<void> {
  await app.whenReady();
  const données = app.getPath('userData');
  const recents = new RecentsStore(fileStorage(join(données, 'recents.json')));
  await recents.load();
  const recovery = new RecoveryStore(join(données, 'recovery'));
  initialiserFenêtres(recovery);

  const reconstruireMenu = () =>
    Menu.setApplicationMenu(
      construireMenu({
        récents: recents.entries(),
        envoyer: envoyerAction,
        nouveau: () => void créerFenêtre({ type: 'new' }),
        ouvrir: () => void ouvrirDepuisBoîte(),
        ouvrirRécent: (chemin) => void ouvrirChemin(chemin),
        imprimer: () => void fenêtreCible()?.webContents.print({ printBackground: true }),
        àPropos: () => void afficherÀPropos(),
        codeSource: () => void shell.openExternal(URL_DÉPÔT),
        développement: !app.isPackaged,
      }),
    );
  const contexte: ContexteIpc = { recents, recovery, reconstruireMenu };

  async function ouvrirChemin(chemin: string): Promise<void> {
    const résultat = await lireDocument(chemin, contexte);
    if (résultat.status === 'opened') ouvrirDemande({ type: 'file', file: résultat.file }, fenêtreCible());
    else if (résultat.status === 'error') void dialog.showMessageBox({ type: 'error', title: fr.app, message: 'Impossible d’ouvrir ce document.', detail: résultat.message });
  }

  async function ouvrirDepuisBoîte(): Promise<void> {
    const cible = fenêtreCible();
    const résultat = await boîteOuvrir(cible, contexte);
    if (résultat.status === 'opened') ouvrirDemande({ type: 'file', file: résultat.file }, cible);
    else if (résultat.status === 'error') void dialog.showMessageBox({ type: 'error', title: fr.app, message: 'Impossible d’ouvrir ce document.', detail: résultat.message });
  }

  async function afficherÀPropos(): Promise<void> {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'À propos',
      message: fr.app,
      detail: `Version ${app.getVersion()}\n\nTraitement de texte libre, sous licence GPL-3.0.\nLe tableur et les présentations arrivent bientôt.\n\n${URL_DÉPÔT}`,
      buttons: ['Fermer', 'Code source'],
      defaultId: 0,
    });
    if (response === 1) void shell.openExternal(URL_DÉPÔT);
  }

  /** Après une fermeture inattendue : propose de retrouver les documents non enregistrés. */
  async function proposerRécupération(): Promise<number> {
    const brouillons = await recovery.list();
    if (!brouillons.length) return 0;
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Récupérer', 'Supprimer'],
      defaultId: 0,
      cancelId: 1,
      title: fr.app,
      message:
        brouillons.length === 1
          ? 'Un document non enregistré a été retrouvé après une fermeture inattendue.'
          : `${brouillons.length} documents non enregistrés ont été retrouvés après une fermeture inattendue.`,
      detail: 'Veux-tu les récupérer ?',
    });
    if (response !== 0) {
      await recovery.clearAll();
      return 0;
    }
    for (const b of brouillons) créerFenêtre({ type: 'recovered', id: b.id, name: b.name, bytes: b.bytes });
    return brouillons.length;
  }

  enregistrerIpc(contexte);
  reconstruireMenu();
  app.on('window-all-closed', () => app.quit());
  app.on('second-instance', (_événement, argv) => {
    void (async () => {
      const chemins = await cheminsDocuments(argv);
      if (chemins.length) {
        for (const chemin of chemins) await ouvrirChemin(chemin);
        return;
      }
      const fenêtre = fenêtreCible();
      if (!fenêtre) créerFenêtre();
      else {
        if (fenêtre.isMinimized()) fenêtre.restore();
        fenêtre.focus();
      }
    })();
  });

  const récupérés = await proposerRécupération();
  const chemins = await cheminsDocuments(process.argv);
  for (const chemin of chemins) await ouvrirChemin(chemin);
  if (!récupérés && !chemins.length && !BrowserWindow.getAllWindows().length) créerFenêtre();
}

if (!app.requestSingleInstanceLock()) app.quit();
else void démarrer();
