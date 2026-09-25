import { join } from 'node:path';
import { BrowserWindow, dialog, shell, type Menu } from 'electron';
import type { InitialRequest, MenuAction, WindowState } from '../shared/bridge';
import { NATIVE_EXTENSION_PATTERN, type AppKind } from '../shared/kinds';
import { IPC } from '../shared/ipc';
import { fr } from '../renderer/fr';
import { installerMenuContextuel } from './context-menu';
import type { RecoveryStore } from './recovery';

export interface InfoFenêtre {
  fenêtre: BrowserWindow;
  état: WindowState | null;
  /** Vrai quand la fermeture a déjà été décidée (enregistré, ou « ne pas enregistrer »). */
  peutFermer: boolean;
  /** Les seuls chemins que cette fenêtre a le droit de réécrire : ceux qu'elle a ouverts ou enregistrés elle-même. */
  cheminsAutorisés: Set<string>;
  /** Ce que la fenêtre doit afficher au démarrage ; lu une seule fois. */
  demande: InitialRequest | null;
  /** L'application ouverte dans la fenêtre (null : écran d'accueil) : elle détermine les menus. */
  app: AppKind | null;
}

const fenêtres = new Map<number, InfoFenêtre>();
let brouillons: RecoveryStore | null = null;
let fournisseurDeMenu: ((app: AppKind | null) => Menu) | null = null;

/** Chaque fenêtre a les menus de son application : on donne ici la façon de les fabriquer. */
export function définirFournisseurDeMenu(fournisseur: (app: AppKind | null) => Menu): void {
  fournisseurDeMenu = fournisseur;
}

export function appliquerMenu(info: InfoFenêtre): void {
  if (fournisseurDeMenu) info.fenêtre.setMenu(fournisseurDeMenu(info.app));
}

export const toutesLesFenêtres = (): InfoFenêtre[] => [...fenêtres.values()];

export function initialiserFenêtres(recovery: RecoveryStore): void {
  brouillons = recovery;
}

export const infoDe = (fenêtre: BrowserWindow | null | undefined): InfoFenêtre | undefined => (fenêtre ? fenêtres.get(fenêtre.id) : undefined);

export function fenêtreCible(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

export function envoyerAction(action: MenuAction): void {
  fenêtreCible()?.webContents.send(IPC.menu, action);
}

export function ouvrirLienExterne(url: string): void {
  if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
}

async function demanderAvantDeFermer(info: InfoFenêtre): Promise<void> {
  const nom = info.état?.name ?? fr.untitled;
  const { response } = await dialog.showMessageBox(info.fenêtre, {
    type: 'question',
    buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'],
    defaultId: 0,
    cancelId: 2,
    title: fr.app,
    message: `Enregistrer les modifications de « ${nom} » avant de fermer ?`,
    detail: 'Tes modifications seront perdues si tu ne les enregistres pas.',
  });
  if (response === 0) {
    // La fenêtre enregistre, puis demande elle-même à se fermer ; si l'enregistrement est annulé, elle reste ouverte.
    info.fenêtre.webContents.send(IPC.menu, 'app:save-and-close' satisfies MenuAction);
  } else if (response === 1) {
    info.peutFermer = true;
    info.fenêtre.close();
  }
}

export function créerFenêtre(demande: InitialRequest | null = null): BrowserWindow {
  const fenêtre = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: fr.app,
    backgroundColor: '#eceff3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  const identifiant = fenêtre.id;
  const info: InfoFenêtre = { fenêtre, état: null, peutFermer: false, cheminsAutorisés: new Set(), demande, app: null };
  fenêtres.set(identifiant, info);
  appliquerMenu(info);

  fenêtre.once('ready-to-show', () => fenêtre.show());
  fenêtre.on('page-title-updated', (événement) => événement.preventDefault());
  fenêtre.on('close', (événement) => {
    if (!info.peutFermer && info.état?.dirty) {
      événement.preventDefault();
      void demanderAvantDeFermer(info);
      return;
    }
    // Fermeture décidée : le brouillon de secours n'a plus de raison d'être.
    if (info.état && info.état.id !== 'accueil') void brouillons?.clear(info.état.id).catch(() => undefined);
  });
  fenêtre.on('closed', () => fenêtres.delete(identifiant));

  fenêtre.webContents.setWindowOpenHandler(({ url }) => {
    ouvrirLienExterne(url);
    return { action: 'deny' };
  });
  fenêtre.webContents.on('will-navigate', (événement, url) => {
    if (url === fenêtre.webContents.getURL()) return;
    événement.preventDefault();
    ouvrirLienExterne(url);
  });
  try {
    fenêtre.webContents.session.setSpellCheckerLanguages(['fr']);
  } catch {
    // Si la langue n'est pas disponible, le correcteur du système reste en place.
  }
  installerMenuContextuel(fenêtre);
  void fenêtre.loadFile(join(__dirname, '../renderer/index.html'));
  return fenêtre;
}

/** Une fenêtre « vierge » (accueil ou document neuf non touché) peut recevoir un document sans en ouvrir une autre. */
function estVierge(info: InfoFenêtre | undefined): boolean {
  const état = info?.état;
  return !!état && !état.dirty && état.path === null && (état.id === 'accueil' || état.name === fr.untitled);
}

/** Ouvre un document dans la fenêtre donnée si elle est vierge, dans une nouvelle fenêtre sinon. */
export function ouvrirDemande(demande: InitialRequest, depuis: BrowserWindow | null): void {
  const source = infoDe(depuis);
  const chemin = demande.type === 'file' && NATIVE_EXTENSION_PATTERN.test(demande.file.path) ? demande.file.path : null;
  if (depuis && source && estVierge(source)) {
    if (chemin) source.cheminsAutorisés.add(chemin);
    depuis.webContents.send(IPC.openRequest, demande);
    return;
  }
  const fenêtre = créerFenêtre(demande);
  if (chemin) infoDe(fenêtre)?.cheminsAutorisés.add(chemin);
}
