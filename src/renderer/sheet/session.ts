import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  Baseline,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Bold,
  Columns3,
  Eraser,
  Italic,
  PaintBucket,
  Redo2,
  Rows3,
  Undo2,
} from 'lucide';
import { SheetEngine, formatNumber } from '../../formats/sheet/engine';
import { sheetCodec } from '../../formats/sheet';
import { parseAddress, type NumberFormat, type SheetDoc } from '../../formats/sheet/model';
import type { Bridge, MenuAction, OpenedFile } from '../../shared/bridge';
import type { AppSession } from '../app-session';
import { DocumentController, type Notice } from '../document-controller';
import { fr } from '../fr';
import { créerBoutonCouleur } from '../ui/color-button';
import { el, icône } from '../ui/dom';
import { showNotice } from '../ui/toast';
import { Grille } from './grid';

type Icône = Parameters<typeof icône>[0];

const FORMATS: [NumberFormat, string][] = [
  ['general', fr.sheet.toolbar.formatGeneral],
  ['int', fr.sheet.toolbar.formatInt],
  ['dec2', fr.sheet.toolbar.formatDec2],
  ['percent', fr.sheet.toolbar.formatPercent],
  ['eur', fr.sheet.toolbar.formatEur],
];

export interface SessionTableur extends AppSession {
  readonly moteur: SheetEngine;
  readonly grille: Grille;
  readonly controller: DocumentController<SheetDoc>;
}

export function créerSessionTableur(hôte: HTMLElement, bridge: Bridge, options: { id?: string } = {}): SessionTableur {
  hôte.replaceChildren();
  const notify = (notice: Notice) => showNotice(notice);
  const racine = el('div', 'sheet-app');
  const moteur = new SheetEngine();
  const àActualiser: Array<() => void> = [];

  // ----- Barre d'outils
  const barre = el('div', 'toolbar');
  barre.setAttribute('role', 'toolbar');
  barre.setAttribute('aria-label', fr.sheet.toolbar.label);
  const groupe = (): HTMLElement => {
    const g = el('div', 'tb-group');
    barre.append(g);
    return g;
  };
  const bouton = (parent: HTMLElement, action: MenuAction, icon: Icône, titre: string, actif?: () => boolean): HTMLButtonElement => {
    const b = el('button', 'tb-btn');
    b.type = 'button';
    b.title = titre;
    b.setAttribute('aria-label', titre);
    b.dataset.action = action;
    b.append(icône(icon));
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => void gérerMenu(action));
    if (actif) {
      àActualiser.push(() => {
        const état = actif();
        b.classList.toggle('is-active', état);
        b.setAttribute('aria-pressed', String(état));
      });
    }
    parent.append(b);
    return b;
  };

  // La grille et ses rappels sont définis plus bas ; les boutons n'agissent qu'après la construction.
  // eslint-disable-next-line prefer-const
  let grille: Grille;
  const contrôleur = new DocumentController<SheetDoc>({
    bridge,
    codec: sheetCodec,
    getDoc: () => moteur.toDoc(),
    setDoc: (doc) => {
      moteur.reset(doc);
      grille.select({ r: 0, c: 0 });
      grille.actualiser();
    },
    notify,
    newId: options.id ? () => options.id as string : undefined,
    onState: (état) => {
      racine.dataset.dirty = String(état.dirty);
      racine.dataset.name = état.name;
    },
  });

  // ----- Barre de formule
  const barreFormule = el('div', 'sh-formula');
  const nom = el('input', 'sh-name');
  nom.type = 'text';
  nom.setAttribute('aria-label', fr.sheet.nameBox);
  nom.spellcheck = false;
  const entrée = el('input', 'sh-input');
  entrée.type = 'text';
  entrée.setAttribute('aria-label', fr.sheet.formulaInput);
  entrée.spellcheck = false;
  barreFormule.append(nom, el('span', 'sh-fx', 'fx'), entrée);

  // ----- État
  const barreÉtat = el('div', 'statusbar');
  const stats = el('span', 'status-count', fr.sheet.ready);
  const taille = el('span', 'sh-size');
  barreÉtat.append(stats, taille);

  const actualiserTout = () => {
    const z = grille.range();
    const seule = z.r1 === z.r2 && z.c1 === z.c2;
    const { count, sum, average } = moteur.stats(z);
    stats.textContent = seule || count === 0 ? fr.sheet.ready : fr.sheet.stats(count, formatNumber(sum, 'general'), formatNumber(average, 'general'));
    taille.textContent = `${moteur.rows} × ${moteur.cols}`;
    for (const f of àActualiser) f();
  };

  grille = new Grille(moteur, {
    onChange: () => {
      moteur.commit();
      contrôleur.markDirty();
      grille.element.dispatchEvent(new CustomEvent('tto-change'));
      entrée.value = moteur.raw(grille.active.r, grille.active.c);
      actualiserTout();
    },
    onSelection: () => {
      nom.value = grille.nomDeLaSélection();
      entrée.value = moteur.raw(grille.active.r, grille.active.c);
      actualiserTout();
    },
    onEditInput: (valeur) => {
      entrée.value = valeur ?? moteur.raw(grille.active.r, grille.active.c);
    },
  });

  // Groupes de la barre d'outils
  const g1 = groupe();
  const annuler = bouton(g1, 'edit:undo', Undo2, fr.sheet.toolbar.undo);
  const rétablir = bouton(g1, 'edit:redo', Redo2, fr.sheet.toolbar.redo);
  àActualiser.push(() => {
    annuler.disabled = !moteur.canUndo();
    rétablir.disabled = !moteur.canRedo();
  });
  const g2 = groupe();
  bouton(g2, 'format:bold', Bold, fr.sheet.toolbar.bold, () => grille.estGras());
  bouton(g2, 'format:italic', Italic, fr.sheet.toolbar.italic, () => grille.estItalique());
  const g3 = groupe();
  bouton(g3, 'format:align-left', AlignLeft, fr.sheet.toolbar.alignLeft, () => grille.styleActif().a === 'left');
  bouton(g3, 'format:align-center', AlignCenter, fr.sheet.toolbar.alignCenter, () => grille.styleActif().a === 'center');
  bouton(g3, 'format:align-right', AlignRight, fr.sheet.toolbar.alignRight, () => grille.styleActif().a === 'right');
  const g4 = groupe();
  for (const spécification of [
    { icône: Baseline, titre: fr.sheet.toolbar.textColor, classe: 'tb-text-color', lire: () => grille.styleActif().c, écrire: (c: string | null) => grille.colorerTexte(c) },
    { icône: PaintBucket, titre: fr.sheet.toolbar.fillColor, classe: 'tb-fill-color', lire: () => grille.styleActif().f, écrire: (c: string | null) => grille.colorerFond(c) },
  ]) {
    const couleur = créerBoutonCouleur({
      icône: spécification.icône,
      titre: spécification.titre,
      classe: spécification.classe,
      aucune: fr.sheet.toolbar.noColor,
      autre: fr.sheet.toolbar.otherColor,
      courante: () => spécification.lire() ?? null,
      appliquer: spécification.écrire,
    });
    àActualiser.push(couleur.refresh);
    g4.append(couleur.element);
  }
  const format = el('select', 'tb-select sh-format');
  format.title = fr.sheet.toolbar.format;
  format.setAttribute('aria-label', fr.sheet.toolbar.format);
  for (const [valeur, libellé] of FORMATS) {
    const option = el('option', undefined, libellé);
    option.value = valeur;
    format.append(option);
  }
  format.addEventListener('change', () => {
    grille.formater(format.value as NumberFormat);
    grille.focaliser();
  });
  àActualiser.push(() => {
    format.value = grille.styleActif().n ?? 'general';
  });
  g4.append(format);
  const g5 = groupe();
  bouton(g5, 'sheet:insert-row', BetweenHorizontalStart, fr.sheet.toolbar.insertRow);
  bouton(g5, 'sheet:insert-col', BetweenVerticalStart, fr.sheet.toolbar.insertCol);
  bouton(g5, 'sheet:delete-row', Rows3, fr.sheet.toolbar.deleteRow);
  bouton(g5, 'sheet:delete-col', Columns3, fr.sheet.toolbar.deleteCol);
  bouton(g5, 'sheet:clear', Eraser, fr.sheet.toolbar.clear);
  const recopier = el('button', 'tb-btn');
  recopier.type = 'button';
  recopier.title = fr.sheet.toolbar.fillDown;
  recopier.setAttribute('aria-label', fr.sheet.toolbar.fillDown);
  recopier.dataset.action = 'sheet:fill-down';
  recopier.append(icône(ArrowDownToLine));
  recopier.addEventListener('mousedown', (e) => e.preventDefault());
  recopier.addEventListener('click', () => grille.recopierVersLeBas());
  g5.append(recopier);

  // Barre de formule : validation et saut vers une adresse
  entrée.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      grille.définirContenu(entrée.value);
      grille.focaliser();
    } else if (e.key === 'Escape') {
      entrée.value = moteur.raw(grille.active.r, grille.active.c);
      grille.focaliser();
    }
  });
  nom.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const a = parseAddress(nom.value);
      if (a) grille.select(a);
      else nom.value = grille.nomDeLaSélection();
      grille.focaliser();
    }
  });

  racine.append(barre, barreFormule, grille.element, barreÉtat);
  hôte.append(racine);
  grille.select({ r: 0, c: 0 }); // montre A1 dans la barre de formule
  contrôleur.startAutosave();
  grille.focaliser();

  async function gérerMenu(action: MenuAction): Promise<void> {
    switch (action) {
      case 'file:save':
        await contrôleur.save();
        break;
      case 'file:save-as':
        await contrôleur.saveAs();
        break;
      case 'file:export-xlsx':
        await contrôleur.exportAs('xlsx');
        break;
      case 'file:export-csv':
        await contrôleur.exportAs('csv');
        break;
      case 'app:save-and-close':
        if (await contrôleur.save()) bridge.closeWindow();
        break;
      case 'edit:undo':
        grille.annuler();
        break;
      case 'edit:redo':
        grille.rétablir();
        break;
      case 'format:bold':
        grille.basculerGras();
        break;
      case 'format:italic':
        grille.basculerItalique();
        break;
      case 'format:align-left':
        grille.aligner('left');
        break;
      case 'format:align-center':
        grille.aligner('center');
        break;
      case 'format:align-right':
        grille.aligner('right');
        break;
      case 'sheet:insert-row':
        grille.insérerLigne();
        break;
      case 'sheet:insert-col':
        grille.insérerColonne();
        break;
      case 'sheet:delete-row':
        grille.supprimerLigne();
        break;
      case 'sheet:delete-col':
        grille.supprimerColonne();
        break;
      case 'sheet:clear':
        grille.effacer();
        break;
      case 'sheet:format-general':
        grille.formater('general');
        break;
      case 'sheet:format-int':
        grille.formater('int');
        break;
      case 'sheet:format-dec2':
        grille.formater('dec2');
        break;
      case 'sheet:format-percent':
        grille.formater('percent');
        break;
      case 'sheet:format-eur':
        grille.formater('eur');
        break;
    }
  }

  return {
    moteur,
    grille,
    controller: contrôleur,
    newDocument: () => grille.focaliser(),
    async openFile(fichier: OpenedFile) {
      const ouvert = await contrôleur.open(fichier);
      grille.focaliser();
      return ouvert;
    },
    async openRecovered(_id: string, nomDuDocument: string, octets: Uint8Array) {
      const ouvert = await contrôleur.openRecovered(nomDuDocument, octets);
      grille.focaliser();
      return ouvert;
    },
    handleMenu: gérerMenu,
    dispose: () => contrôleur.dispose(),
  };
}
