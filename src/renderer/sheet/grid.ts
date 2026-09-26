import { SheetEngine, normaliserRange, type ClipboardPayload, type Range } from '../../formats/sheet/engine';
import { MAX_COLS, MAX_ROWS, ROW_HEIGHT, colName, type Alignment, type MediaCell, type NumberFormat } from '../../formats/sheet/model';
import { el } from '../ui/dom';

interface Cellule {
  r: number;
  c: number;
}

export interface RappelsGrille {
  /** Le contenu ou le style a changé : à enregistrer dans l'historique et à marquer « modifié ». */
  onChange(): void;
  /** La sélection a bougé. */
  onSelection(): void;
  /** Le texte en cours de saisie (null quand la saisie se termine) : la barre de formule le reflète. */
  onEditInput(valeur: string | null): void;
  /** L'utilisateur a cliqué sur la pastille son / vidéo d'une cellule (déjà sélectionnée). */
  onMedia?(): void;
}

const LARGEUR_EN_TÊTE = 48;
const PAGE = 15;
const AGRANDISSEMENT = 50;
const MIME_INTERNE = 'application/x-tto-sheet';

const dansLesLimites = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/** Copie reçue du presse-papiers : on ne fait confiance ni à sa forme ni à sa taille. */
function chargeUtileValide(brut: string): ClipboardPayload | null {
  try {
    const o = JSON.parse(brut) as ClipboardPayload;
    const ok =
      typeof o?.origin?.r === 'number' &&
      typeof o.origin.c === 'number' &&
      Array.isArray(o.raw) &&
      Array.isArray(o.styles) &&
      o.raw.length > 0 &&
      o.raw.length <= 2000 &&
      o.raw.every((l) => Array.isArray(l) && l.length > 0 && l.length <= 200 && l.every((v) => typeof v === 'string')) &&
      o.styles.length === o.raw.length;
    return ok ? o : null;
  } catch {
    return null;
  }
}

/** La grille : n'affiche que les cellules visibles, gère la sélection, la saisie, le clavier et le presse-papiers. */
export class Grille {
  readonly element = el('div', 'sg');
  active: Cellule = { r: 0, c: 0 };
  focus: Cellule = { r: 0, c: 0 };
  private readonly corps = el('div', 'sg-body');
  private readonly toile = el('div', 'sg-canvas');
  private readonly couche = el('div', 'sg-cells');
  private readonly zone = el('div', 'sg-range');
  private readonly cellule = el('div', 'sg-active');
  private readonly saisie = el('input', 'sg-editor');
  private readonly enTêteColonnes = el('div', 'sg-colheads');
  private readonly enTêteLignes = el('div', 'sg-rowheads');
  private readonly colonnes = el('div', 'sg-colheads-inner');
  private readonly lignes = el('div', 'sg-rowheads-inner');
  private décalages: number[] = [0];
  private enSaisie = false;
  private image = 0;
  private presseInterne: { charge: ClipboardPayload; texte: string } | null = null;

  constructor(
    private readonly moteur: SheetEngine,
    private readonly rappels: RappelsGrille,
  ) {
    this.element.setAttribute('role', 'grid');
    this.element.setAttribute('aria-label', 'Feuille de calcul');
    this.corps.tabIndex = 0;
    this.saisie.type = 'text';
    this.saisie.hidden = true;
    this.saisie.spellcheck = false;
    this.saisie.setAttribute('aria-label', 'Saisie dans la cellule');
    this.toile.append(this.couche, this.zone, this.cellule, this.saisie);
    this.corps.append(this.toile);
    this.enTêteColonnes.append(this.colonnes);
    this.enTêteLignes.append(this.lignes);
    this.element.append(el('div', 'sg-corner'), this.enTêteColonnes, this.enTêteLignes, this.corps);

    this.corps.addEventListener('scroll', () => this.programmerRendu());
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.programmerRendu()).observe(this.corps);
    this.corps.addEventListener('mousedown', (e) => this.surSouris(e));
    this.corps.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('.sg-cell')) this.commencerSaisie();
    });
    this.corps.addEventListener('keydown', (e) => this.surTouche(e));
    this.corps.addEventListener('copy', (e) => this.copier(e, false));
    this.corps.addEventListener('cut', (e) => this.copier(e, true));
    this.corps.addEventListener('paste', (e) => this.coller(e));
    this.enTêteColonnes.addEventListener('mousedown', (e) => this.surEnTêteColonne(e));
    this.enTêteLignes.addEventListener('mousedown', (e) => this.surEnTêteLigne(e));
    this.saisie.addEventListener('keydown', (e) => this.surToucheSaisie(e));
    this.saisie.addEventListener('input', () => this.rappels.onEditInput(this.saisie.value));
    this.saisie.addEventListener('blur', () => {
      if (this.enSaisie) this.terminerSaisie(true, 0, 0, false);
    });
    this.recalculerDécalages();
    this.rendre();
  }

  // ---------- Sélection ----------

  range(): Range {
    return normaliserRange(this.active.r, this.active.c, this.focus.r, this.focus.c);
  }

  private plage(): string {
    const z = this.range();
    const a = `${colName(z.c1)}${z.r1 + 1}`;
    return z.r1 === z.r2 && z.c1 === z.c2 ? a : `${a}:${colName(z.c2)}${z.r2 + 1}`;
  }

  /** L'adresse de la cellule (ou de la zone) sélectionnée, « B2 » ou « B2:D5 ». */
  nomDeLaSélection(): string {
    return this.plage();
  }

  select(active: Cellule, focus: Cellule = active): void {
    this.active = { r: dansLesLimites(active.r, 0, this.moteur.rows - 1), c: dansLesLimites(active.c, 0, this.moteur.cols - 1) };
    this.focus = { r: dansLesLimites(focus.r, 0, this.moteur.rows - 1), c: dansLesLimites(focus.c, 0, this.moteur.cols - 1) };
    this.assurerVisible(this.focus);
    this.placerSélection();
    this.rappels.onSelection();
  }

  private déplacer(dr: number, dc: number, étendre: boolean): void {
    const base = étendre ? this.focus : this.active;
    if (dr > 0 && base.r >= this.moteur.rows - 2 && this.moteur.rows < MAX_ROWS) this.moteur.rows = Math.min(MAX_ROWS, this.moteur.rows + AGRANDISSEMENT);
    if (dc > 0 && base.c >= this.moteur.cols - 2 && this.moteur.cols < MAX_COLS) this.moteur.cols = Math.min(MAX_COLS, this.moteur.cols + 5);
    const suivante = { r: dansLesLimites(base.r + dr, 0, this.moteur.rows - 1), c: dansLesLimites(base.c + dc, 0, this.moteur.cols - 1) };
    if (étendre) this.select(this.active, suivante);
    else this.select(suivante);
    this.programmerRendu();
  }

  // ---------- Affichage ----------

  /** À appeler quand le classeur a changé de l'extérieur (ouverture, annulation, structure). */
  actualiser(): void {
    this.recalculerDécalages();
    this.active = { r: dansLesLimites(this.active.r, 0, this.moteur.rows - 1), c: dansLesLimites(this.active.c, 0, this.moteur.cols - 1) };
    this.focus = { r: dansLesLimites(this.focus.r, 0, this.moteur.rows - 1), c: dansLesLimites(this.focus.c, 0, this.moteur.cols - 1) };
    this.rendre();
    this.rappels.onSelection();
  }

  private recalculerDécalages(): void {
    this.décalages = [0];
    for (let c = 0; c < this.moteur.cols; c++) this.décalages.push(this.décalages[c] + this.moteur.colWidth(c));
  }

  private colonneÀ(x: number): number {
    let bas = 0;
    let haut = this.moteur.cols - 1;
    while (bas < haut) {
      const milieu = (bas + haut + 1) >> 1;
      if (this.décalages[milieu] <= x) bas = milieu;
      else haut = milieu - 1;
    }
    return bas;
  }

  private programmerRendu(): void {
    if (this.image) return;
    this.image = requestAnimationFrame(() => {
      this.image = 0;
      this.rendre();
    });
  }

  private rendre(): void {
    const { scrollLeft, scrollTop, clientWidth, clientHeight } = this.corps;
    const r0 = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 1);
    const r1 = Math.min(this.moteur.rows - 1, Math.ceil((scrollTop + clientHeight) / ROW_HEIGHT) + 1);
    const c0 = Math.max(0, this.colonneÀ(scrollLeft) - 1);
    const c1 = Math.min(this.moteur.cols - 1, this.colonneÀ(scrollLeft + clientWidth) + 1);
    this.toile.style.width = `${this.décalages[this.moteur.cols]}px`;
    this.toile.style.height = `${this.moteur.rows * ROW_HEIGHT}px`;

    const cellules = document.createDocumentFragment();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const style = this.moteur.style(r, c);
        const v = this.moteur.value(r, c);
        const d = document.createElement('div');
        d.className = 'sg-cell';
        d.dataset.r = String(r);
        d.dataset.c = String(c);
        d.style.left = `${this.décalages[c]}px`;
        d.style.top = `${r * ROW_HEIGHT}px`;
        d.style.width = `${this.moteur.colWidth(c)}px`;
        const alignement: Alignment = style.a ?? (typeof v === 'number' ? 'right' : typeof v === 'boolean' || (typeof v === 'object' && v) ? 'center' : 'left');
        d.style.textAlign = alignement;
        if (style.b) d.style.fontWeight = '700';
        if (style.i) d.style.fontStyle = 'italic';
        if (style.c) d.style.color = style.c;
        if (style.f) d.style.background = style.f;
        if (typeof v === 'object' && v) d.classList.add('sg-error');
        d.textContent = this.moteur.display(r, c);
        const média = this.moteur.media(r, c);
        if (média) {
          d.classList.add('sg-has-media');
          const pastille = el('span', 'sg-media');
          pastille.title = média.title;
          pastille.setAttribute('role', 'img');
          pastille.setAttribute('aria-label', `${média.kind === 'video' ? 'Vidéo' : 'Son'} : ${média.title}`);
          pastille.textContent = média.kind === 'video' ? '▶' : '♪';
          d.append(pastille);
        }
        cellules.append(d);
      }
    }
    this.couche.replaceChildren(cellules);

    const têtesC = document.createDocumentFragment();
    for (let c = c0; c <= c1; c++) {
      const t = el('div', 'sg-head', colName(c));
      t.dataset.c = String(c);
      t.style.left = `${this.décalages[c]}px`;
      t.style.width = `${this.moteur.colWidth(c)}px`;
      const poignée = el('span', 'sg-resize');
      poignée.dataset.c = String(c);
      t.append(poignée);
      têtesC.append(t);
    }
    this.colonnes.style.width = `${this.décalages[this.moteur.cols]}px`;
    this.colonnes.style.transform = `translateX(${-scrollLeft}px)`;
    this.colonnes.replaceChildren(têtesC);
    const têtesL = document.createDocumentFragment();
    for (let r = r0; r <= r1; r++) {
      const t = el('div', 'sg-head', String(r + 1));
      t.dataset.r = String(r);
      t.style.top = `${r * ROW_HEIGHT}px`;
      têtesL.append(t);
    }
    this.lignes.style.height = `${this.moteur.rows * ROW_HEIGHT}px`;
    this.lignes.style.transform = `translateY(${-scrollTop}px)`;
    this.lignes.replaceChildren(têtesL);
    this.placerSélection();
  }

  private placerSélection(): void {
    const z = this.range();
    const x = this.décalages[z.c1] ?? 0;
    const largeur = (this.décalages[z.c2 + 1] ?? this.décalages[this.moteur.cols]) - x;
    Object.assign(this.zone.style, { left: `${x}px`, top: `${z.r1 * ROW_HEIGHT}px`, width: `${largeur}px`, height: `${(z.r2 - z.r1 + 1) * ROW_HEIGHT}px` });
    this.zone.hidden = z.r1 === z.r2 && z.c1 === z.c2;
    Object.assign(this.cellule.style, { left: `${this.décalages[this.active.c]}px`, top: `${this.active.r * ROW_HEIGHT}px`, width: `${this.moteur.colWidth(this.active.c)}px`, height: `${ROW_HEIGHT}px` });
    this.cellule.dataset.address = `${colName(this.active.c)}${this.active.r + 1}`;
    for (const t of this.colonnes.children) (t as HTMLElement).classList.toggle('is-selected', Number((t as HTMLElement).dataset.c) >= z.c1 && Number((t as HTMLElement).dataset.c) <= z.c2);
    for (const t of this.lignes.children) (t as HTMLElement).classList.toggle('is-selected', Number((t as HTMLElement).dataset.r) >= z.r1 && Number((t as HTMLElement).dataset.r) <= z.r2);
  }

  private assurerVisible(cellule: Cellule): void {
    const x = this.décalages[cellule.c];
    const largeur = this.moteur.colWidth(cellule.c);
    const y = cellule.r * ROW_HEIGHT;
    const { scrollLeft, scrollTop, clientWidth, clientHeight } = this.corps;
    if (x < scrollLeft) this.corps.scrollLeft = x;
    else if (x + largeur > scrollLeft + clientWidth) this.corps.scrollLeft = x + largeur - clientWidth;
    if (y < scrollTop) this.corps.scrollTop = y;
    else if (y + ROW_HEIGHT > scrollTop + clientHeight) this.corps.scrollTop = y + ROW_HEIGHT - clientHeight;
  }

  // ---------- Souris ----------

  private surSouris(e: MouseEvent): void {
    const cible = (e.target as HTMLElement).closest<HTMLElement>('.sg-cell');
    if (!cible || e.button !== 0) return;
    if (this.enSaisie) this.terminerSaisie(true, 0, 0);
    const cellule = { r: Number(cible.dataset.r), c: Number(cible.dataset.c) };
    if (e.shiftKey) this.select(this.active, cellule);
    else this.select(cellule);
    this.corps.focus();
    if ((e.target as HTMLElement).closest('.sg-media')) {
      this.rappels.onMedia?.();
      e.preventDefault();
      return;
    }
    const glisser = (m: MouseEvent) => {
      const sous = document.elementFromPoint(m.clientX, m.clientY)?.closest<HTMLElement>('.sg-cell');
      if (sous) this.select(this.active, { r: Number(sous.dataset.r), c: Number(sous.dataset.c) });
    };
    const fin = () => {
      document.removeEventListener('mousemove', glisser);
      document.removeEventListener('mouseup', fin);
    };
    document.addEventListener('mousemove', glisser);
    document.addEventListener('mouseup', fin);
    e.preventDefault();
  }

  private surEnTêteColonne(e: MouseEvent): void {
    const cible = e.target as HTMLElement;
    const c = Number((cible.closest('.sg-head') as HTMLElement | null)?.dataset.c);
    if (Number.isNaN(c)) return;
    if (cible.classList.contains('sg-resize')) {
      const départ = e.clientX;
      const largeur = this.moteur.colWidth(c);
      const glisser = (m: MouseEvent) => {
        this.moteur.setColWidth(c, largeur + m.clientX - départ);
        this.recalculerDécalages();
        this.rendre();
      };
      const fin = () => {
        document.removeEventListener('mousemove', glisser);
        document.removeEventListener('mouseup', fin);
        this.rappels.onChange();
      };
      document.addEventListener('mousemove', glisser);
      document.addEventListener('mouseup', fin);
      e.preventDefault();
      return;
    }
    if (this.enSaisie) this.terminerSaisie(true, 0, 0);
    if (e.shiftKey) this.select(this.active, { r: this.moteur.rows - 1, c });
    else this.select({ r: 0, c }, { r: this.moteur.rows - 1, c });
    this.corps.focus();
    e.preventDefault();
  }

  private surEnTêteLigne(e: MouseEvent): void {
    const r = Number((e.target as HTMLElement).closest<HTMLElement>('.sg-head')?.dataset.r);
    if (Number.isNaN(r)) return;
    if (this.enSaisie) this.terminerSaisie(true, 0, 0);
    if (e.shiftKey) this.select(this.active, { r, c: this.moteur.cols - 1 });
    else this.select({ r, c: 0 }, { r, c: this.moteur.cols - 1 });
    this.corps.focus();
    e.preventDefault();
  }

  // ---------- Clavier ----------

  private surTouche(e: KeyboardEvent): void {
    // Les touches tapées dans la zone de saisie remontent jusqu'ici : elles ont déjà été traitées par elle.
    if (this.enSaisie || e.target === this.saisie) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const aller = (dr: number, dc: number, étendre = e.shiftKey) => {
      e.preventDefault();
      this.déplacer(dr, dc, étendre);
    };
    switch (e.key) {
      case 'ArrowUp':
        return aller(-1, 0);
      case 'ArrowDown':
        return aller(1, 0);
      case 'ArrowLeft':
        return aller(0, -1);
      case 'ArrowRight':
        return aller(0, 1);
      case 'PageUp':
        return aller(-PAGE, 0);
      case 'PageDown':
        return aller(PAGE, 0);
      case 'Tab':
        return aller(0, e.shiftKey ? -1 : 1, false);
      case 'Enter':
        return aller(e.shiftKey ? -1 : 1, 0, false);
      case 'Home':
        e.preventDefault();
        return this.select(ctrl ? { r: 0, c: 0 } : { r: this.active.r, c: 0 });
      case 'F2':
        e.preventDefault();
        return this.commencerSaisie();
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        return this.effacer();
    }
    if (ctrl) {
      const touche = e.key.toLowerCase();
      if (touche === 'a') {
        e.preventDefault();
        return this.select({ r: 0, c: 0 }, { r: this.moteur.rows - 1, c: this.moteur.cols - 1 });
      }
      if (touche === 'b') return void (e.preventDefault(), this.basculerGras());
      if (touche === 'i') return void (e.preventDefault(), this.basculerItalique());
      if (touche === 'z') return void (e.preventDefault(), e.shiftKey ? this.rétablir() : this.annuler());
      if (touche === 'y') return void (e.preventDefault(), this.rétablir());
      if (touche === 'd') return void (e.preventDefault(), this.recopierVersLeBas());
      return;
    }
    if (e.key.length === 1 && !e.altKey) {
      e.preventDefault();
      this.commencerSaisie(e.key);
    }
  }

  private surToucheSaisie(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.terminerSaisie(true, e.shiftKey ? -1 : 1, 0);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.terminerSaisie(true, 0, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.terminerSaisie(false, 0, 0);
    }
  }

  // ---------- Saisie ----------

  commencerSaisie(initial?: string): void {
    this.enSaisie = true;
    Object.assign(this.saisie.style, {
      left: `${this.décalages[this.active.c]}px`,
      top: `${this.active.r * ROW_HEIGHT}px`,
      minWidth: `${this.moteur.colWidth(this.active.c)}px`,
      height: `${ROW_HEIGHT}px`,
    });
    this.saisie.value = initial ?? this.moteur.raw(this.active.r, this.active.c);
    this.saisie.hidden = false;
    this.saisie.focus();
    if (initial === undefined) this.saisie.select();
    this.rappels.onEditInput(this.saisie.value);
  }

  /** Enregistre (ou abandonne) ce qui a été tapé, puis passe à la cellule voisine. */
  terminerSaisie(valider: boolean, dr: number, dc: number, rendreLeFocus = true): void {
    if (!this.enSaisie) return;
    this.enSaisie = false;
    const valeur = this.saisie.value;
    this.saisie.hidden = true;
    this.rappels.onEditInput(null);
    if (valider && valeur !== this.moteur.raw(this.active.r, this.active.c)) {
      this.moteur.setRaw(this.active.r, this.active.c, valeur);
      this.rappels.onChange();
    }
    if (dr || dc) this.déplacer(dr, dc, false);
    this.rendre();
    if (rendreLeFocus) this.corps.focus();
  }

  /** Valide un texte saisi ailleurs (la barre de formule) dans la cellule active. */
  définirContenu(valeur: string): void {
    if (valeur === this.moteur.raw(this.active.r, this.active.c)) return;
    this.moteur.setRaw(this.active.r, this.active.c, valeur);
    this.rendre();
    this.rappels.onChange();
  }

  /** Le son ou la vidéo de la cellule active. */
  médiaActif(): MediaCell | undefined {
    return this.moteur.media(this.active.r, this.active.c);
  }

  /** Rattache (ou retire, avec null) un son ou une vidéo à la cellule active. */
  définirMédia(média: MediaCell | null): void {
    this.moteur.setMedia(this.active.r, this.active.c, média);
    this.rendre();
    this.rappels.onChange();
  }

  effacer(): void {
    this.moteur.clear(this.range());
    this.rendre();
    this.rappels.onChange();
  }

  // ---------- Mise en forme ----------

  private appliquerStyle(patch: Parameters<SheetEngine['setStyle']>[1]): void {
    this.moteur.setStyle(this.range(), patch);
    this.rendre();
    this.rappels.onChange();
  }

  private toutes(prédicat: (r: number, c: number) => boolean): boolean {
    const z = this.range();
    for (let r = z.r1; r <= z.r2; r++) for (let c = z.c1; c <= z.c2; c++) if (!prédicat(r, c)) return false;
    return true;
  }

  estGras = (): boolean => this.toutes((r, c) => !!this.moteur.style(r, c).b);
  estItalique = (): boolean => this.toutes((r, c) => !!this.moteur.style(r, c).i);
  basculerGras = (): void => this.appliquerStyle({ b: !this.estGras() });
  basculerItalique = (): void => this.appliquerStyle({ i: !this.estItalique() });
  aligner = (a: Alignment): void => this.appliquerStyle({ a });
  colorerTexte = (couleur: string | null): void => this.appliquerStyle({ c: couleur ?? undefined });
  colorerFond = (couleur: string | null): void => this.appliquerStyle({ f: couleur ?? undefined });
  formater = (n: NumberFormat): void => this.appliquerStyle({ n });
  styleActif = () => this.moteur.style(this.active.r, this.active.c);

  // ---------- Structure ----------

  private structure(action: () => void): void {
    if (this.enSaisie) this.terminerSaisie(true, 0, 0);
    action();
    this.actualiser();
    this.rappels.onChange();
  }

  insérerLigne(): void {
    const z = this.range();
    this.structure(() => {
      for (let i = z.r1; i <= z.r2; i++) this.moteur.insertRow(z.r1);
    });
  }

  insérerColonne(): void {
    const z = this.range();
    this.structure(() => {
      for (let i = z.c1; i <= z.c2; i++) this.moteur.insertCol(z.c1);
    });
  }

  supprimerLigne(): void {
    const z = this.range();
    this.structure(() => {
      for (let r = z.r2; r >= z.r1; r--) this.moteur.deleteRow(r);
    });
  }

  supprimerColonne(): void {
    const z = this.range();
    this.structure(() => {
      for (let c = z.c2; c >= z.c1; c--) this.moteur.deleteCol(c);
    });
  }

  /** Ctrl+D : recopie la première ligne de la sélection sur les suivantes, en décalant les formules. */
  recopierVersLeBas(): void {
    const z = this.range();
    if (z.r1 === z.r2) return;
    const source = this.moteur.copy({ ...z, r2: z.r1 });
    for (let r = z.r1 + 1; r <= z.r2; r++) this.moteur.paste(source, r, z.c1);
    this.rendre();
    this.rappels.onChange();
  }

  // ---------- Historique ----------

  annuler(): void {
    if (this.enSaisie) this.terminerSaisie(false, 0, 0);
    if (this.moteur.undo()) {
      this.actualiser();
      this.rappels.onChange();
    }
  }

  rétablir(): void {
    if (this.moteur.redo()) {
      this.actualiser();
      this.rappels.onChange();
    }
  }

  // ---------- Presse-papiers ----------

  private copier(e: ClipboardEvent, couper: boolean): void {
    if (this.enSaisie) return; // la saisie garde son presse-papiers normal
    const z = this.range();
    const charge = this.moteur.copy(z);
    const texte = this.moteur.toTsv(z);
    e.clipboardData?.setData('text/plain', texte);
    e.clipboardData?.setData(MIME_INTERNE, JSON.stringify(charge));
    this.presseInterne = { charge, texte };
    e.preventDefault();
    if (couper) this.effacer();
  }

  private coller(e: ClipboardEvent): void {
    if (this.enSaisie) return;
    e.preventDefault();
    const interne = e.clipboardData?.getData(MIME_INTERNE);
    const texte = e.clipboardData?.getData('text/plain') ?? '';
    const charge = (interne && chargeUtileValide(interne)) || (this.presseInterne && this.presseInterne.texte === texte ? this.presseInterne.charge : null);
    if (!charge && !texte) return;
    const zone = charge ? this.moteur.paste(charge, this.active.r, this.active.c) : this.moteur.pasteText(texte, this.active.r, this.active.c);
    this.select({ r: zone.r1, c: zone.c1 }, { r: zone.r2, c: zone.c2 });
    this.actualiser();
    this.rappels.onChange();
  }

  focaliser(): void {
    this.corps.focus();
  }
}
