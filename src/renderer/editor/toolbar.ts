import type { Editor } from '@tiptap/core';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  CalendarDays,
  Film,
  Highlighter,
  Image as IcôneImage,
  Italic,
  Link as IcôneLien,
  List,
  ListOrdered,
  ListTodo,
  ListTree,
  Minus,
  Printer,
  Quote,
  Sigma,
  Redo2,
  RemoveFormatting,
  SeparatorHorizontal,
  Strikethrough,
  Subscript,
  Superscript,
  Table as IcôneTableau,
  Underline,
  Undo2,
} from 'lucide';
import { fr } from '../fr';
import { el, icône } from '../ui/dom';
import { attacherPopup } from '../ui/popup';
import { runAction, type EditorAction, type EditorUi } from './actions';

type Icône = Parameters<typeof icône>[0];

export interface BarreOutils {
  element: HTMLElement;
  /** À appeler quand la sélection ou le contenu change, pour refléter l'état des boutons. */
  refresh(): void;
}

interface DéfBouton {
  action: EditorAction;
  icône: Icône;
  titre: string;
  actif?: (éditeur: Editor) => boolean;
}

const POLICES: [string, string][] = [
  ['Arial, Helvetica, sans-serif', 'Arial'],
  ['Georgia, serif', 'Georgia'],
  ['"Times New Roman", Times, serif', 'Times New Roman'],
  ['"Courier New", Courier, monospace', 'Courier New'],
  ['Verdana, Geneva, sans-serif', 'Verdana'],
  ['"Trebuchet MS", sans-serif', 'Trebuchet MS'],
];
const TAILLES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const TAILLE_PAR_DÉFAUT = '12pt';
const INTERLIGNES: [string, string][] = [['1', '1'], ['1.15', '1,15'], ['1.5', '1,5'], ['2', '2']];
const PALETTE = ['#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff', '#e03131', '#f76707', '#f59f00', '#2f9e44', '#1971c2', '#7048e8', '#c2255c', '#0c8599'];

const premierNom = (famille: string): string => famille.split(',')[0].replace(/["']/g, '').trim().toLowerCase();

/** Sélectionne une option, en l'ajoutant si le document utilise une valeur que la liste ne propose pas. */
function choisir(sélecteur: HTMLSelectElement, valeur: string, libellé: string): void {
  if (![...sélecteur.options].some((o) => o.value === valeur)) {
    const option = el('option', undefined, libellé);
    option.value = valeur;
    sélecteur.append(option);
  }
  sélecteur.value = valeur;
}

export function créerBarreOutils(éditeur: Editor, ui: EditorUi): BarreOutils {
  const barre = el('div', 'toolbar');
  barre.setAttribute('role', 'toolbar');
  barre.setAttribute('aria-label', fr.editor.toolbar);
  const àActualiser: Array<() => void> = [];

  const groupe = (): HTMLElement => {
    const g = el('div', 'tb-group');
    barre.append(g);
    return g;
  };

  const bouton = (parent: HTMLElement, définition: DéfBouton): HTMLButtonElement => {
    const b = el('button', 'tb-btn');
    b.type = 'button';
    b.title = définition.titre;
    b.setAttribute('aria-label', définition.titre);
    b.dataset.action = définition.action;
    b.append(icône(définition.icône));
    b.addEventListener('mousedown', (e) => e.preventDefault()); // garde la sélection dans le texte
    b.addEventListener('click', () => void runAction(définition.action, éditeur, ui));
    const actif = définition.actif;
    if (actif) {
      àActualiser.push(() => {
        const état = actif(éditeur);
        b.classList.toggle('is-active', état);
        b.setAttribute('aria-pressed', String(état));
      });
    }
    parent.append(b);
    return b;
  };

  const sélecteur = (parent: HTMLElement, classe: string, titre: string, options: [string, string][], surChoix: (valeur: string) => void): HTMLSelectElement => {
    const s = el('select', `tb-select ${classe}`);
    s.title = titre;
    s.setAttribute('aria-label', titre);
    for (const [valeur, libellé] of options) {
      const option = el('option', undefined, libellé);
      option.value = valeur;
      s.append(option);
    }
    s.addEventListener('change', () => surChoix(s.value));
    parent.append(s);
    return s;
  };

  const boutonCouleur = (
    parent: HTMLElement,
    d: { icône: Icône; titre: string; classe: string; courante: () => string | null; appliquer: (couleur: string | null) => void },
  ) => {
    const b = el('button', `tb-btn tb-color ${d.classe}`);
    b.type = 'button';
    b.title = d.titre;
    b.setAttribute('aria-label', d.titre);
    b.append(icône(d.icône));
    b.addEventListener('mousedown', (e) => e.preventDefault());
    attacherPopup(b, (fermer) => {
      const menu = el('div', 'color-popup');
      const grille = el('div', 'swatches');
      for (const couleur of PALETTE) {
        const pastille = el('button', 'swatch');
        pastille.type = 'button';
        pastille.title = couleur;
        pastille.setAttribute('aria-label', couleur);
        pastille.style.background = couleur;
        pastille.addEventListener('mousedown', (e) => e.preventDefault());
        pastille.addEventListener('click', () => {
          d.appliquer(couleur);
          fermer();
        });
        grille.append(pastille);
      }
      const aucune = el('button', 'popup-item', fr.toolbar.noColor);
      aucune.type = 'button';
      aucune.addEventListener('mousedown', (e) => e.preventDefault());
      aucune.addEventListener('click', () => {
        d.appliquer(null);
        fermer();
      });
      const autre = el('label', 'popup-item', fr.toolbar.otherColor);
      const entrée = el('input');
      entrée.type = 'color';
      entrée.value = d.courante() ?? '#000000';
      entrée.addEventListener('change', () => {
        d.appliquer(entrée.value);
        fermer();
      });
      autre.append(entrée);
      menu.append(grille, aucune, autre);
      return menu;
    });
    àActualiser.push(() => b.style.setProperty('--tb-couleur', d.courante() ?? 'transparent'));
    parent.append(b);
  };

  // Annuler / rétablir
  const g1 = groupe();
  const annuler = bouton(g1, { action: 'edit:undo', icône: Undo2, titre: fr.toolbar.undo });
  const rétablir = bouton(g1, { action: 'edit:redo', icône: Redo2, titre: fr.toolbar.redo });
  bouton(g1, { action: 'file:print', icône: Printer, titre: fr.toolbar.print });
  àActualiser.push(() => {
    annuler.disabled = !éditeur.can().undo();
    rétablir.disabled = !éditeur.can().redo();
  });

  // Style, police, taille
  const g2 = groupe();
  const style = sélecteur(
    g2,
    'tb-style',
    fr.toolbar.style,
    [['p', fr.toolbar.paragraph], ...[1, 2, 3, 4, 5, 6].map((n): [string, string] => [`h${n}`, fr.toolbar.heading(n)])],
    (valeur) => {
      const chaîne = éditeur.chain().focus();
      if (valeur === 'p') chaîne.setParagraph().run();
      else chaîne.setHeading({ level: Number(valeur.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
    },
  );
  àActualiser.push(() => {
    const niveau = [1, 2, 3, 4, 5, 6].find((n) => éditeur.isActive('heading', { level: n }));
    style.value = niveau ? `h${niveau}` : 'p';
  });

  const police = sélecteur(g2, 'tb-font', fr.toolbar.font, [['', fr.toolbar.fontDefault], ...POLICES.map(([valeur, nom]): [string, string] => [valeur, nom])], (valeur) => {
    if (valeur) éditeur.chain().focus().setFontFamily(valeur).run();
    else éditeur.chain().focus().unsetFontFamily().run();
  });
  àActualiser.push(() => {
    const famille = String(éditeur.getAttributes('textStyle').fontFamily ?? '');
    if (!famille) return void (police.value = '');
    const connue = POLICES.find(([valeur]) => premierNom(valeur) === premierNom(famille));
    choisir(police, connue ? connue[0] : famille, connue ? connue[1] : famille.split(',')[0].replace(/["']/g, '').trim());
  });

  const taille = sélecteur(g2, 'tb-size', fr.toolbar.size, TAILLES.map((n): [string, string] => [`${n}pt`, String(n)]), (valeur) => {
    éditeur.chain().focus().setFontSize(valeur).run();
  });
  àActualiser.push(() => {
    const valeur = String(éditeur.getAttributes('textStyle').fontSize ?? TAILLE_PAR_DÉFAUT);
    choisir(taille, valeur, valeur.replace(/pt$/, ''));
  });

  // Mise en forme du texte
  const g3 = groupe();
  const marques: DéfBouton[] = [
    { action: 'format:bold', icône: Bold, titre: fr.toolbar.bold, actif: (e) => e.isActive('bold') },
    { action: 'format:italic', icône: Italic, titre: fr.toolbar.italic, actif: (e) => e.isActive('italic') },
    { action: 'format:underline', icône: Underline, titre: fr.toolbar.underline, actif: (e) => e.isActive('underline') },
    { action: 'format:strike', icône: Strikethrough, titre: fr.toolbar.strike, actif: (e) => e.isActive('strike') },
    { action: 'format:superscript', icône: Superscript, titre: fr.toolbar.superscript, actif: (e) => e.isActive('superscript') },
    { action: 'format:subscript', icône: Subscript, titre: fr.toolbar.subscript, actif: (e) => e.isActive('subscript') },
  ];
  for (const définition of marques) bouton(g3, définition);
  boutonCouleur(g3, {
    icône: Baseline,
    titre: fr.toolbar.textColor,
    classe: 'tb-text-color',
    courante: () => (éditeur.getAttributes('textStyle').color as string | undefined) ?? null,
    appliquer: (couleur) => {
      if (couleur) éditeur.chain().focus().setColor(couleur).run();
      else éditeur.chain().focus().unsetColor().run();
    },
  });
  boutonCouleur(g3, {
    icône: Highlighter,
    titre: fr.toolbar.highlight,
    classe: 'tb-highlight',
    courante: () => (éditeur.getAttributes('highlight').color as string | undefined) ?? null,
    appliquer: (couleur) => {
      if (couleur) éditeur.chain().focus().setHighlight({ color: couleur }).run();
      else éditeur.chain().focus().unsetHighlight().run();
    },
  });
  bouton(g3, { action: 'format:clear', icône: RemoveFormatting, titre: fr.toolbar.clearFormat });

  // Alignement
  const g4 = groupe();
  const alignements: [EditorAction, Icône, string, string][] = [
    ['format:align-left', AlignLeft, fr.toolbar.alignLeft, 'left'],
    ['format:align-center', AlignCenter, fr.toolbar.alignCenter, 'center'],
    ['format:align-right', AlignRight, fr.toolbar.alignRight, 'right'],
    ['format:align-justify', AlignJustify, fr.toolbar.alignJustify, 'justify'],
  ];
  for (const [action, icon, titre, valeur] of alignements) bouton(g4, { action, icône: icon, titre, actif: (e) => e.isActive({ textAlign: valeur }) });

  // Interligne et listes
  const g5 = groupe();
  const interligne = sélecteur(g5, 'tb-lineheight', fr.toolbar.lineHeight, [['', fr.toolbar.lineHeightDefault], ...INTERLIGNES], (valeur) => {
    if (valeur) éditeur.chain().focus().setLineHeight(valeur).run();
    else éditeur.chain().focus().unsetLineHeight().run();
  });
  àActualiser.push(() => {
    const valeur = String(éditeur.getAttributes('paragraph').lineHeight ?? éditeur.getAttributes('heading').lineHeight ?? '');
    choisir(interligne, valeur, valeur.replace('.', ','));
  });
  bouton(g5, { action: 'format:bullet-list', icône: List, titre: fr.toolbar.bulletList, actif: (e) => e.isActive('bulletList') });
  bouton(g5, { action: 'format:ordered-list', icône: ListOrdered, titre: fr.toolbar.orderedList, actif: (e) => e.isActive('orderedList') });
  bouton(g5, { action: 'format:task-list', icône: ListTodo, titre: fr.toolbar.taskList, actif: (e) => e.isActive('taskList') });
  bouton(g5, { action: 'format:blockquote', icône: Quote, titre: fr.toolbar.quote, actif: (e) => e.isActive('blockquote') });

  // Insertion
  const g6 = groupe();
  bouton(g6, { action: 'insert:link', icône: IcôneLien, titre: fr.toolbar.link, actif: (e) => e.isActive('link') });
  bouton(g6, { action: 'insert:image', icône: IcôneImage, titre: fr.toolbar.image });
  const boutonTableau = el('button', 'tb-btn tb-table');
  boutonTableau.type = 'button';
  boutonTableau.title = fr.toolbar.table;
  boutonTableau.setAttribute('aria-label', fr.toolbar.table);
  boutonTableau.append(icône(IcôneTableau));
  boutonTableau.addEventListener('mousedown', (e) => e.preventDefault());
  attacherPopup(boutonTableau, (fermer) => {
    const menu = el('div', 'table-popup');
    const commandes: { libellé: string; peut: () => boolean; exécuter: () => void; séparateur?: boolean }[] = [
      { libellé: fr.table.insert, peut: () => true, exécuter: () => void runAction('insert:table', éditeur, ui), séparateur: true },
      { libellé: fr.table.rowBefore, peut: () => éditeur.can().addRowBefore(), exécuter: () => éditeur.chain().focus().addRowBefore().run() },
      { libellé: fr.table.rowAfter, peut: () => éditeur.can().addRowAfter(), exécuter: () => éditeur.chain().focus().addRowAfter().run() },
      { libellé: fr.table.deleteRow, peut: () => éditeur.can().deleteRow(), exécuter: () => éditeur.chain().focus().deleteRow().run(), séparateur: true },
      { libellé: fr.table.colBefore, peut: () => éditeur.can().addColumnBefore(), exécuter: () => éditeur.chain().focus().addColumnBefore().run() },
      { libellé: fr.table.colAfter, peut: () => éditeur.can().addColumnAfter(), exécuter: () => éditeur.chain().focus().addColumnAfter().run() },
      { libellé: fr.table.deleteCol, peut: () => éditeur.can().deleteColumn(), exécuter: () => éditeur.chain().focus().deleteColumn().run(), séparateur: true },
      { libellé: fr.table.merge, peut: () => éditeur.can().mergeCells(), exécuter: () => éditeur.chain().focus().mergeCells().run() },
      { libellé: fr.table.split, peut: () => éditeur.can().splitCell(), exécuter: () => éditeur.chain().focus().splitCell().run() },
      { libellé: fr.table.header, peut: () => éditeur.can().toggleHeaderRow(), exécuter: () => éditeur.chain().focus().toggleHeaderRow().run(), séparateur: true },
      { libellé: fr.table.deleteTable, peut: () => éditeur.can().deleteTable(), exécuter: () => éditeur.chain().focus().deleteTable().run() },
    ];
    for (const commande of commandes) {
      const item = el('button', 'popup-item', commande.libellé);
      item.type = 'button';
      item.disabled = !commande.peut();
      item.addEventListener('mousedown', (e) => e.preventDefault());
      item.addEventListener('click', () => {
        commande.exécuter();
        fermer();
      });
      menu.append(item);
      if (commande.séparateur) menu.append(el('div', 'popup-separator'));
    }
    return menu;
  });
  g6.append(boutonTableau);
  bouton(g6, { action: 'insert:media', icône: Film, titre: fr.toolbar.media });
  bouton(g6, { action: 'insert:math', icône: Sigma, titre: fr.toolbar.math });
  bouton(g6, { action: 'insert:date', icône: CalendarDays, titre: fr.toolbar.date });
  bouton(g6, { action: 'insert:toc', icône: ListTree, titre: fr.toolbar.toc });
  bouton(g6, { action: 'insert:hr', icône: Minus, titre: fr.toolbar.hr });
  bouton(g6, { action: 'insert:page-break', icône: SeparatorHorizontal, titre: fr.toolbar.pageBreak });

  const actualiser = () => {
    for (const f of àActualiser) f();
  };
  éditeur.on('transaction', actualiser);
  actualiser();
  return { element: barre, refresh: actualiser };
}
