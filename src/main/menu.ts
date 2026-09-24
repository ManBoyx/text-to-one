import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { MenuAction, RecentEntry } from '../shared/bridge';

export interface MenuDeps {
  récents: RecentEntry[];
  envoyer(action: MenuAction): void;
  nouveau(): void;
  ouvrir(): void;
  ouvrirRécent(chemin: string): void;
  imprimer(): void;
  àPropos(): void;
  codeSource(): void;
  développement: boolean;
}

const séparateur: MenuItemConstructorOptions = { type: 'separator' };

/** Les menus, en français. Ils envoient leurs actions à la fenêtre active, qui sait quoi en faire. */
export function construireMenu(d: MenuDeps): Menu {
  const action = (libellé: string, act: MenuAction, extra: Partial<MenuItemConstructorOptions> = {}): MenuItemConstructorOptions => ({
    label: libellé,
    click: () => d.envoyer(act),
    ...extra,
  });
  // Ces raccourcis sont seulement affichés : l'éditeur les gère lui-même, et les enregistrer ici les ferait jouer deux fois.
  const affiché = (accélérateur: string): Partial<MenuItemConstructorOptions> => ({ accelerator: accélérateur, registerAccelerator: false });

  const modèle: MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Nouveau', accelerator: 'CmdOrCtrl+N', click: d.nouveau, id: 'file-new' },
        { label: 'Ouvrir…', accelerator: 'CmdOrCtrl+O', click: d.ouvrir, id: 'file-open' },
        {
          label: 'Ouvrir un document récent',
          submenu: d.récents.length
            ? d.récents.map((e): MenuItemConstructorOptions => ({ label: e.name, click: () => d.ouvrirRécent(e.path) }))
            : [{ label: 'Aucun document récent', enabled: false }],
        },
        séparateur,
        action('Enregistrer', 'file:save', { accelerator: 'CmdOrCtrl+S', id: 'file-save' }),
        action('Enregistrer sous…', 'file:save-as', { accelerator: 'CmdOrCtrl+Shift+S', id: 'file-save-as' }),
        {
          label: 'Exporter',
          submenu: [
            action('Document Word (.docx)', 'file:export-docx', { id: 'file-export-docx' }),
            action('PDF', 'file:export-pdf', { id: 'file-export-pdf' }),
            action('Page web (.html)', 'file:export-html'),
            action('Texte brut (.txt)', 'file:export-txt'),
            action('Markdown (.md)', 'file:export-md'),
          ],
        },
        séparateur,
        { label: 'Imprimer…', accelerator: 'CmdOrCtrl+P', click: d.imprimer },
        séparateur,
        { role: 'close', label: 'Fermer la fenêtre' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        action('Annuler', 'edit:undo', affiché('CmdOrCtrl+Z')),
        action('Rétablir', 'edit:redo', affiché('CmdOrCtrl+Y')),
        séparateur,
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
        séparateur,
        action('Rechercher…', 'edit:find', { accelerator: 'CmdOrCtrl+F' }),
        action('Remplacer…', 'edit:replace', { accelerator: 'CmdOrCtrl+H' }),
      ],
    },
    {
      label: 'Insertion',
      submenu: [
        action('Image…', 'insert:image'),
        action('Tableau', 'insert:table'),
        action('Lien…', 'insert:link', { accelerator: 'CmdOrCtrl+K' }),
        action('Ligne de séparation', 'insert:hr'),
        action('Saut de page', 'insert:page-break'),
      ],
    },
    {
      label: 'Format',
      submenu: [
        action('Gras', 'format:bold', affiché('CmdOrCtrl+B')),
        action('Italique', 'format:italic', affiché('CmdOrCtrl+I')),
        action('Souligné', 'format:underline', affiché('CmdOrCtrl+U')),
        action('Barré', 'format:strike'),
        action('Exposant', 'format:superscript'),
        action('Indice', 'format:subscript'),
        séparateur,
        {
          label: 'Alignement',
          submenu: [
            action('À gauche', 'format:align-left'),
            action('Centré', 'format:align-center'),
            action('À droite', 'format:align-right'),
            action('Justifié', 'format:align-justify'),
          ],
        },
        action('Liste à puces', 'format:bullet-list'),
        action('Liste numérotée', 'format:ordered-list'),
        action('Liste de tâches', 'format:task-list'),
        action('Citation', 'format:blockquote'),
        séparateur,
        action('Effacer la mise en forme', 'format:clear'),
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        action('Zoom avant', 'view:zoom-in', { accelerator: 'CmdOrCtrl+Plus' }),
        action('Zoom arrière', 'view:zoom-out', { accelerator: 'CmdOrCtrl+-' }),
        action('Zoom 100 %', 'view:zoom-reset', { accelerator: 'CmdOrCtrl+0' }),
        séparateur,
        {
          label: 'Thème',
          submenu: [action('Automatique', 'view:theme-system'), action('Clair', 'view:theme-light'), action('Sombre', 'view:theme-dark')],
        },
        séparateur,
        { role: 'togglefullscreen', label: 'Plein écran' },
        ...(d.développement ? [{ role: 'toggleDevTools', label: 'Outils de développement' } as MenuItemConstructorOptions] : []),
      ],
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'À propos de Text to One', click: d.àPropos },
        { label: 'Code source', click: d.codeSource },
      ],
    },
  ];
  return Menu.buildFromTemplate(modèle);
}
