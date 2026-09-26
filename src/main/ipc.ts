import { basename, dirname, join } from 'node:path';
import { BrowserWindow, app, dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { OpenOutcome, SaveOutcome, SaveRequest, WindowState } from '../shared/bridge';
import { IPC } from '../shared/ipc';
import { KIND_INFO, NATIVE_EXTENSION_PATTERN, NATIVE_KIND, OPENABLE_EXTENSIONS, isAppKind, isSaveKind } from '../shared/kinds';
import { fr } from '../renderer/fr';
import { TAILLE_MAX_DOCUMENT, describeFsError, ensureExtension, readDocumentFile, sanitizeFileName, writeFileAtomic } from './files';
import type { RecentsStore } from './recents';
import type { RecoveryStore } from './recovery';
import { appliquerMenu, infoDe, ouvrirLienExterne, type InfoFenêtre } from './windows';

export interface ContexteIpc {
  recents: RecentsStore;
  recovery: RecoveryStore;
  reconstruireMenu(): void;
}

let dernierDossier: string | null = null;
const dossierCourant = (): string => dernierDossier ?? app.getPath('documents');

/** Lit un document du disque et le range dans les récents ; les erreurs deviennent des messages. */
export async function lireDocument(chemin: string, ctx: ContexteIpc): Promise<OpenOutcome> {
  try {
    const fichier = await readDocumentFile(chemin);
    await ctx.recents.add(chemin, fichier.name);
    ctx.reconstruireMenu();
    return { status: 'opened', file: fichier };
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === 'ENOENT') {
      await ctx.recents.remove(chemin);
      ctx.reconstruireMenu();
    }
    return { status: 'error', message: describeFsError(erreur) };
  }
}

/** La boîte « Ouvrir » ; `fenêtre` peut être absente quand on ouvre depuis les menus sans fenêtre active. */
export async function boîteOuvrir(fenêtre: BrowserWindow | null, ctx: ContexteIpc): Promise<OpenOutcome> {
  const options = {
    title: 'Ouvrir un document',
    defaultPath: dossierCourant(),
    properties: ['openFile' as const],
    filters: [
      { name: 'Tous les documents', extensions: OPENABLE_EXTENSIONS },
      { name: 'Textes (Text to One, Word)', extensions: ['tto', 'docx'] },
      { name: 'Tableurs (Text to One, Excel, CSV)', extensions: ['tts', 'xlsx', 'csv'] },
      { name: 'Présentations', extensions: ['ttp'] },
    ],
  };
  const choix = fenêtre ? await dialog.showOpenDialog(fenêtre, options) : await dialog.showOpenDialog(options);
  if (choix.canceled || !choix.filePaths[0]) return { status: 'cancelled' };
  dernierDossier = dirname(choix.filePaths[0]);
  return lireDocument(choix.filePaths[0], ctx);
}

const estNatif = (type: string): boolean => (Object.values(NATIVE_KIND) as string[]).includes(type);

function validerEnregistrement(valeur: unknown): SaveRequest | null {
  if (typeof valeur !== 'object' || valeur === null) return null;
  const r = valeur as Partial<SaveRequest>;
  const cheminValide = r.path === null || typeof r.path === 'string';
  if (!cheminValide || typeof r.suggestedName !== 'string' || r.suggestedName.length > 300) return null;
  if (!isSaveKind(r.kind) || !(r.bytes instanceof Uint8Array) || r.bytes.byteLength > TAILLE_MAX_DOCUMENT) return null;
  return { path: r.path as string | null, suggestedName: r.suggestedName, kind: r.kind, bytes: r.bytes };
}

function validerÉtat(valeur: unknown): WindowState | null {
  if (typeof valeur !== 'object' || valeur === null) return null;
  const e = valeur as Partial<WindowState>;
  if (typeof e.id !== 'string' || typeof e.name !== 'string' || typeof e.dirty !== 'boolean') return null;
  if (e.path !== null && typeof e.path !== 'string') return null;
  return { id: e.id.slice(0, 64), name: e.name.slice(0, 200), dirty: e.dirty, path: e.path ?? null, app: isAppKind(e.app) ? e.app : null };
}

export function enregistrerIpc(ctx: ContexteIpc): void {
  /** Ne répond qu'aux pages de l'application elle-même, et retrouve la fenêtre qui parle. */
  const fenêtreDe = (événement: IpcMainInvokeEvent | IpcMainEvent): InfoFenêtre => {
    const cadre = événement.senderFrame;
    if (!cadre || cadre !== événement.sender.mainFrame || !cadre.url.startsWith('file://')) throw new Error('Expéditeur non autorisé.');
    const info = infoDe(BrowserWindow.fromWebContents(événement.sender));
    if (!info) throw new Error('Fenêtre inconnue.');
    return info;
  };

  ipcMain.handle(IPC.init, (événement) => {
    const info = fenêtreDe(événement);
    const demande = info.demande;
    info.demande = null;
    return demande;
  });

  ipcMain.handle(IPC.openDialog, async (événement): Promise<OpenOutcome> => {
    const info = fenêtreDe(événement);
    const résultat = await boîteOuvrir(info.fenêtre, ctx);
    if (résultat.status === 'opened' && NATIVE_EXTENSION_PATTERN.test(résultat.file.path)) info.cheminsAutorisés.add(résultat.file.path);
    return résultat;
  });

  ipcMain.handle(IPC.readRecent, async (événement, chemin: unknown): Promise<OpenOutcome> => {
    const info = fenêtreDe(événement);
    if (typeof chemin !== 'string' || !ctx.recents.has(chemin)) {
      return { status: 'error', message: 'Ce document ne fait plus partie des documents récents.' };
    }
    const résultat = await lireDocument(chemin, ctx);
    if (résultat.status === 'opened' && NATIVE_EXTENSION_PATTERN.test(chemin)) info.cheminsAutorisés.add(chemin);
    return résultat;
  });

  ipcMain.handle(IPC.save, async (événement, demande: unknown): Promise<SaveOutcome> => {
    const info = fenêtreDe(événement);
    const requête = validerEnregistrement(demande);
    if (!requête) return { status: 'error', message: "La demande d'enregistrement est invalide." };
    const extension = KIND_INFO[requête.kind].extension;
    let chemin = requête.path && info.cheminsAutorisés.has(requête.path) ? requête.path : null;
    if (!chemin) {
      const choix = await dialog.showSaveDialog(info.fenêtre, {
        title: estNatif(requête.kind) ? 'Enregistrer le document' : 'Exporter le document',
        defaultPath: join(dossierCourant(), sanitizeFileName(requête.suggestedName)),
        filters: [{ name: KIND_INFO[requête.kind].label, extensions: [extension] }],
      });
      if (choix.canceled || !choix.filePath) return { status: 'cancelled' };
      chemin = ensureExtension(choix.filePath, extension);
      dernierDossier = dirname(chemin);
    }
    try {
      await writeFileAtomic(chemin, requête.bytes);
    } catch (erreur) {
      return { status: 'error', message: describeFsError(erreur) };
    }
    if (estNatif(requête.kind)) {
      info.cheminsAutorisés.add(chemin);
      await ctx.recents.add(chemin, basename(chemin));
      ctx.reconstruireMenu();
    }
    return { status: 'saved', path: chemin, name: basename(chemin) };
  });

  ipcMain.handle(IPC.exportPdf, async (événement, nomSuggéré: unknown): Promise<SaveOutcome> => {
    const info = fenêtreDe(événement);
    const nom = sanitizeFileName(typeof nomSuggéré === 'string' ? nomSuggéré : 'Document.pdf');
    const choix = await dialog.showSaveDialog(info.fenêtre, {
      title: 'Exporter en PDF',
      defaultPath: join(dossierCourant(), nom),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (choix.canceled || !choix.filePath) return { status: 'cancelled' };
    const chemin = ensureExtension(choix.filePath, 'pdf');
    try {
      const pdf = await info.fenêtre.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
      await writeFileAtomic(chemin, pdf);
    } catch (erreur) {
      return { status: 'error', message: describeFsError(erreur) };
    }
    dernierDossier = dirname(chemin);
    return { status: 'saved', path: chemin, name: basename(chemin) };
  });

  ipcMain.on(IPC.print, (événement) => {
    fenêtreDe(événement).fenêtre.webContents.print({ printBackground: true });
  });

  ipcMain.handle(IPC.listRecents, (événement) => {
    fenêtreDe(événement);
    return ctx.recents.entries();
  });

  ipcMain.on(IPC.windowState, (événement, valeur: unknown) => {
    const info = fenêtreDe(événement);
    const état = validerÉtat(valeur);
    if (!état) return;
    info.état = état;
    if (info.app !== état.app) {
      info.app = état.app ?? null;
      appliquerMenu(info); // chaque application a ses propres menus
    }
    info.fenêtre.setTitle(état.id === 'accueil' ? fr.app : `${état.dirty ? '• ' : ''}${état.name} — ${fr.app}`);
  });

  ipcMain.handle(IPC.writeRecovery, async (événement, id: unknown, nom: unknown, octets: unknown, app: unknown) => {
    fenêtreDe(événement);
    if (typeof id !== 'string' || typeof nom !== 'string' || !(octets instanceof Uint8Array) || octets.byteLength > TAILLE_MAX_DOCUMENT) {
      throw new Error('Demande de récupération invalide.');
    }
    const extension = KIND_INFO[NATIVE_KIND[isAppKind(app) ? app : 'text']].extension;
    await ctx.recovery.write(id, nom.slice(0, 200), octets, extension);
  });

  ipcMain.handle(IPC.clearRecovery, async (événement, id: unknown) => {
    fenêtreDe(événement);
    if (typeof id !== 'string') throw new Error('Demande de récupération invalide.');
    await ctx.recovery.clear(id);
  });

  ipcMain.on(IPC.closeWindow, (événement) => {
    const info = fenêtreDe(événement);
    info.peutFermer = true;
    info.fenêtre.close();
  });

  ipcMain.on(IPC.openExternal, (événement, url: unknown) => {
    fenêtreDe(événement);
    if (typeof url === 'string') ouvrirLienExterne(url);
  });
}
