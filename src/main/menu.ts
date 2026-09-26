import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { MenuAction, RecentEntry } from '../shared/bridge';
import type { AppKind } from '../shared/kinds';
import { PALETTES } from '../shared/themes';

export interface MenuDeps {
  récents: RecentEntry[];
  envoyer(action: MenuAction): void;
  nouveau(app: AppKind): void;
  ouvrir(): void;
  ouvrirRécent(chemin: string): void;
  àPropos(): void;
  codeSource(): void;
  développement: boolean;
  /** L'application de la fenêtre : chacune a ses menus ; null pour l'écran d'accueil. */
  app: AppKind | null;
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

  const ouvrirEtRécents: MenuItemConstructorOptions[] = [
    {
      label: 'Nouveau',
      id: 'file-new',
      submenu: [
        { label: 'Document texte', accelerator: 'CmdOrCtrl+N', click: () => d.nouveau('text'), id: 'file-new-text' },
        { label: 'Tableur', click: () => d.nouveau('sheet'), id: 'file-new-sheet' },
        { label: 'Présentation', click: () => d.nouveau('slides'), id: 'file-new-slides' },
      ],
    },
    { label: 'Ouvrir…', accelerator: 'CmdOrCtrl+O', click: d.ouvrir, id: 'file-open' },
    {
      label: 'Ouvrir un document récent',
      submenu: d.récents.length
        ? d.récents.map((e): MenuItemConstructorOptions => ({ label: e.name, click: () => d.ouvrirRécent(e.path) }))
        : [{ label: 'Aucun document récent', enabled: false }],
    },
  ];
  const enregistrer: MenuItemConstructorOptions[] = [
    action('Enregistrer', 'file:save', { accelerator: 'CmdOrCtrl+S', id: 'file-save' }),
    action('Enregistrer sous…', 'file:save-as', { accelerator: 'CmdOrCtrl+Shift+S', id: 'file-save-as' }),
  ];
  const fermer: MenuItemConstructorOptions[] = [
    séparateur,
    { role: 'close', label: 'Fermer la fenêtre' },
    { role: 'quit', label: 'Quitter' },
  ];
  const exporter = (éléments: MenuItemConstructorOptions[]): MenuItemConstructorOptions => ({ label: 'Exporter', submenu: éléments });
  const imprimer: MenuItemConstructorOptions[] = [séparateur, action('Imprimer…', 'file:print', { accelerator: 'CmdOrCtrl+P', id: 'file-print' })];

  const thème: MenuItemConstructorOptions = {
    label: 'Thème',
    submenu: [
      action('Automatique', 'view:theme-system'),
      action('Clair', 'view:theme-light'),
      action('Sombre', 'view:theme-dark'),
      séparateur,
      { label: 'Palettes', submenu: PALETTES.map((p) => action(p.label, `view:theme-${p.id}` as const)) },
      action('Personnalisé', 'view:theme-custom'),
      séparateur,
      action('Tous les thèmes…', 'view:themes'),
    ],
  };
  const affichage = (avecZoom: boolean): MenuItemConstructorOptions => ({
    label: 'Affichage',
    submenu: [
      ...(avecZoom
        ? [
            action('Zoom avant', 'view:zoom-in', { accelerator: 'CmdOrCtrl+Plus' }),
            action('Zoom arrière', 'view:zoom-out', { accelerator: 'CmdOrCtrl+-' }),
            action('Zoom 100 %', 'view:zoom-reset', { accelerator: 'CmdOrCtrl+0' }),
            séparateur,
          ]
        : []),
      thème,
      séparateur,
      { role: 'togglefullscreen', label: 'Plein écran' },
      ...(d.développement ? [{ role: 'toggleDevTools', label: 'Outils de développement' } as MenuItemConstructorOptions] : []),
    ],
  });
  const aide: MenuItemConstructorOptions = {
    label: 'Aide',
    submenu: [
      { label: 'À propos de Text to One', click: d.àPropos },
      { label: 'Code source', click: d.codeSource },
    ],
  };
  const annulerRétablir: MenuItemConstructorOptions[] = [
    action('Annuler', 'edit:undo', affiché('CmdOrCtrl+Z')),
    action('Rétablir', 'edit:redo', affiché('CmdOrCtrl+Y')),
  ];
  const alignement: MenuItemConstructorOptions = {
    label: 'Alignement',
    submenu: [
      action('À gauche', 'format:align-left'),
      action('Centré', 'format:align-center'),
      action('À droite', 'format:align-right'),
    ],
  };

  // ----- Accueil : de quoi ouvrir ou créer un document
  const menuAccueil: MenuItemConstructorOptions[] = [{ label: 'Fichier', submenu: [...ouvrirEtRécents, ...fermer] }, affichage(false), aide];

  // ----- Traitement de texte
  const menuTexte: MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        ...ouvrirEtRécents,
        séparateur,
        ...enregistrer,
        exporter([
          action('Document Word (.docx)', 'file:export-docx', { id: 'file-export-docx' }),
          action('PDF', 'file:export-pdf', { id: 'file-export-pdf' }),
          action('Page web (.html)', 'file:export-html'),
          action('Texte brut (.txt)', 'file:export-txt'),
          action('Markdown (.md)', 'file:export-md'),
        ]),
        ...imprimer,
        ...fermer,
      ],
    },
    {
      label: 'Édition',
      submenu: [
        ...annulerRétablir,
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
        action('Formule mathématique…', 'insert:math', { accelerator: 'CmdOrCtrl+Alt+M' }),
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
        { ...alignement, submenu: [...(alignement.submenu as MenuItemConstructorOptions[]), action('Justifié', 'format:align-justify')] },
        action('Liste à puces', 'format:bullet-list'),
        action('Liste numérotée', 'format:ordered-list'),
        action('Liste de tâches', 'format:task-list'),
        action('Citation', 'format:blockquote'),
        séparateur,
        action('Effacer la mise en forme', 'format:clear'),
      ],
    },
    affichage(true),
    aide,
  ];

  // ----- Tableur
  const menuTableur: MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        ...ouvrirEtRécents,
        séparateur,
        ...enregistrer,
        exporter([
          action('Classeur Excel (.xlsx)', 'file:export-xlsx', { id: 'file-export-xlsx' }),
          action('Tableau CSV (.csv)', 'file:export-csv', { id: 'file-export-csv' }),
        ]),
        ...fermer,
      ],
    },
    {
      label: 'Édition',
      submenu: [
        ...annulerRétablir,
        séparateur,
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        séparateur,
        action('Effacer le contenu', 'sheet:clear'),
      ],
    },
    {
      label: 'Format',
      submenu: [
        action('Gras', 'format:bold', affiché('CmdOrCtrl+B')),
        action('Italique', 'format:italic', affiché('CmdOrCtrl+I')),
        alignement,
        séparateur,
        {
          label: 'Format des nombres',
          submenu: [
            action('Standard', 'sheet:format-general'),
            action('Nombre entier', 'sheet:format-int'),
            action('Deux décimales', 'sheet:format-dec2'),
            action('Pourcentage', 'sheet:format-percent'),
            action('Euro', 'sheet:format-eur'),
          ],
        },
      ],
    },
    {
      label: 'Insertion',
      submenu: [
        action('Ligne au-dessus', 'sheet:insert-row'),
        action('Colonne à gauche', 'sheet:insert-col'),
        séparateur,
        action('Supprimer la ligne', 'sheet:delete-row'),
        action('Supprimer la colonne', 'sheet:delete-col'),
      ],
    },
    affichage(false),
    aide,
  ];

  // ----- Présentations
  const menuPrésentation: MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        ...ouvrirEtRécents,
        séparateur,
        ...enregistrer,
        exporter([
          action('Présentation PowerPoint (.pptx)', 'file:export-pptx', { id: 'file-export-pptx' }),
          action('PDF', 'file:export-pdf', { id: 'file-export-pdf' }),
        ]),
        ...fermer,
      ],
    },
    {
      label: 'Édition',
      submenu: [
        ...annulerRétablir,
        séparateur,
        action('Dupliquer l’objet', 'slides:duplicate-object', { accelerator: 'CmdOrCtrl+D', registerAccelerator: false }),
        action('Supprimer l’objet', 'slides:delete-object'),
      ],
    },
    {
      label: 'Insertion',
      submenu: [
        action('Zone de texte', 'slides:insert-text'),
        action('Rectangle', 'slides:insert-rect'),
        action('Ellipse', 'slides:insert-ellipse'),
        action('Image…', 'slides:insert-image'),
      ],
    },
    {
      label: 'Diapositive',
      submenu: [
        action('Nouvelle diapositive', 'slides:new-slide', { accelerator: 'CmdOrCtrl+M', registerAccelerator: false }),
        action('Dupliquer la diapositive', 'slides:duplicate-slide'),
        action('Supprimer la diapositive', 'slides:delete-slide'),
        séparateur,
        action('Monter la diapositive', 'slides:move-up'),
        action('Descendre la diapositive', 'slides:move-down'),
        séparateur,
        action('Présenter', 'slides:present', affiché('F5')), // la fenêtre gère F5 elle-même
      ],
    },
    {
      label: 'Format',
      submenu: [
        action('Gras', 'format:bold', affiché('CmdOrCtrl+B')),
        action('Italique', 'format:italic', affiché('CmdOrCtrl+I')),
        alignement,
        séparateur,
        action('Premier plan', 'slides:bring-front'),
        action('Arrière-plan', 'slides:send-back'),
      ],
    },
    affichage(false),
    aide,
  ];

  const modèle = d.app === 'sheet' ? menuTableur : d.app === 'slides' ? menuPrésentation : d.app === 'text' ? menuTexte : menuAccueil;
  return Menu.buildFromTemplate(modèle);
}
