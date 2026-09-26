import type { AppKind, SaveKind } from './kinds';
import { THEME_IDS, type ThemeId } from './themes';

export interface OpenedFile {
  path: string;
  name: string;
  bytes: Uint8Array;
}

export type OpenOutcome =
  | { status: 'opened'; file: OpenedFile }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface SaveRequest {
  /** Chemin déjà connu du document, ou null pour demander où l'enregistrer. */
  path: string | null;
  suggestedName: string;
  kind: SaveKind;
  bytes: Uint8Array;
}

export type SaveOutcome =
  | { status: 'saved'; path: string; name: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface RecentEntry {
  path: string;
  name: string;
}

/** Ce que la fenêtre dit d'elle-même au processus principal : titre, fermeture, récupération. */
export interface WindowState {
  id: string;
  name: string;
  dirty: boolean;
  path: string | null;
  /** L'application ouverte dans la fenêtre ; null sur l'écran d'accueil. */
  app?: AppKind | null;
}

/** Ce que le processus principal demande d'afficher dans une fenêtre. */
export type InitialRequest =
  | { type: 'new'; app?: AppKind }
  | { type: 'file'; file: OpenedFile }
  | { type: 'recovered'; id: string; name: string; app?: AppKind; bytes: Uint8Array };

/** Les actions envoyées par les menus natifs à la fenêtre. */
export const MENU_ACTIONS = [
  'file:save', 'file:save-as', 'file:print', 'file:export-docx', 'file:export-html', 'file:export-txt', 'file:export-md', 'file:export-pdf',
  'edit:undo', 'edit:redo', 'edit:find', 'edit:replace',
  'insert:image', 'insert:table', 'insert:link', 'insert:hr', 'insert:page-break', 'insert:math', 'insert:media', 'insert:date', 'insert:toc',
  'format:bold', 'format:italic', 'format:underline', 'format:strike', 'format:superscript', 'format:subscript',
  'format:align-left', 'format:align-center', 'format:align-right', 'format:align-justify',
  'format:bullet-list', 'format:ordered-list', 'format:task-list', 'format:blockquote', 'format:clear',
  'view:focus', 'view:zoom-in', 'view:zoom-out', 'view:zoom-reset', 'view:theme-light', 'view:theme-dark', 'view:theme-system', 'view:themes',
  'file:export-xlsx', 'file:export-csv', 'file:export-pptx',
  'sheet:insert-media', 'sheet:insert-row', 'sheet:insert-col', 'sheet:delete-row', 'sheet:delete-col', 'sheet:clear',
  'sheet:format-general', 'sheet:format-int', 'sheet:format-dec2', 'sheet:format-percent', 'sheet:format-eur',
  'slides:new-slide', 'slides:duplicate-slide', 'slides:delete-slide', 'slides:move-up', 'slides:move-down',
  'slides:insert-text', 'slides:insert-rect', 'slides:insert-ellipse', 'slides:insert-image', 'slides:insert-media', 'slides:present',
  'slides:bring-front', 'slides:send-back', 'slides:duplicate-object', 'slides:delete-object',
  'app:save-and-close',
] as const;

/** Les thèmes en plus de « clair », « sombre » et « automatique » : une action par palette, et une pour le thème personnalisé. */
export type ThemeAction = `view:theme-${ThemeId}`;
const ACTIONS_THÈME = new Set<string>(THEME_IDS.map((id) => `view:theme-${id}`));

export type MenuAction = (typeof MENU_ACTIONS)[number] | ThemeAction;

export function isMenuAction(valeur: unknown): valeur is MenuAction {
  return typeof valeur === 'string' && ((MENU_ACTIONS as readonly string[]).includes(valeur) || ACTIONS_THÈME.has(valeur));
}

/** Le pont préchargé : tout ce que l'interface peut demander au processus principal, rien d'autre. */
export interface Bridge {
  init(): Promise<InitialRequest | null>;
  openDialog(): Promise<OpenOutcome>;
  readRecent(path: string): Promise<OpenOutcome>;
  save(request: SaveRequest): Promise<SaveOutcome>;
  exportPdf(suggestedName: string): Promise<SaveOutcome>;
  /** Ouvre la boîte d'impression du système pour la fenêtre. */
  print(): void;
  listRecents(): Promise<RecentEntry[]>;
  setWindowState(state: WindowState): void;
  writeRecovery(id: string, name: string, bytes: Uint8Array, app: AppKind): Promise<void>;
  clearRecovery(id: string): Promise<void>;
  closeWindow(): void;
  openExternal(url: string): void;
  onMenu(callback: (action: MenuAction) => void): void;
  onOpenRequest(callback: (request: InitialRequest) => void): void;
}

declare global {
  interface Window {
    tto: Bridge;
  }
}
