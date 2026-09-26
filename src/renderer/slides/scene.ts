import { SLIDE_H, SLIDE_W, aDuTexte, cloner, type Slide, type SlideObject } from '../../formats/slides/model';
import { el } from '../ui/dom';
import { nœudDeTexte, placerObjet, rendreObjet } from './render';

type Poignée = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const POIGNÉES: Poignée[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const TAILLE_MIN = 20;

export interface RappelsScène {
  /** Le contenu de la diapositive a changé (à enregistrer dans l'historique). */
  onChange(): void;
  /** L'objet sélectionné a changé. */
  onSelect(): void;
}

/** La zone d'édition d'une diapositive : sélection, déplacement, redimensionnement, texte en place, clavier. */
export class Scène {
  readonly element = el('div', 'stage');
  private readonly cadre = el('div', 'stage-frame');
  private readonly toile = el('div', 'stage-canvas');
  private readonly cadreDeSélection = el('div', 'sel');
  private diapo: Slide | null = null;
  private idSélectionné: string | null = null;
  private échelle = 1;
  private nœudEnSaisie: HTMLElement | null = null;

  constructor(private readonly rappels: RappelsScène) {
    this.element.tabIndex = 0;
    this.element.setAttribute('aria-label', 'Diapositive en cours de modification');
    this.toile.style.width = `${SLIDE_W}px`;
    this.toile.style.height = `${SLIDE_H}px`;
    for (const p of POIGNÉES) {
      const poignée = el('div', `handle handle-${p}`);
      poignée.dataset.h = p;
      this.cadreDeSélection.append(poignée);
    }
    this.cadre.append(this.toile);
    this.element.append(this.cadre);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.ajuster()).observe(this.element);
    this.toile.addEventListener('pointerdown', (e) => this.surPointeur(e));
    this.toile.addEventListener('dblclick', (e) => {
      const objet = (e.target as HTMLElement).closest<HTMLElement>('.obj');
      if (objet?.dataset.id && !(e.target as HTMLElement).closest('.media-play')) this.commencerSaisie(objet.dataset.id);
    });
    this.element.addEventListener('keydown', (e) => this.surTouche(e));
  }

  // ---------- Affichage ----------

  afficher(diapo: Slide): void {
    this.terminerSaisie();
    this.diapo = diapo;
    if (!diapo.objects.some((o) => o.id === this.idSélectionné)) this.idSélectionné = null;
    this.dessiner();
    this.ajuster();
  }

  /** Redessine la diapositive (après un changement venu de l'extérieur : annulation, ordre des objets…). */
  dessiner(): void {
    if (!this.diapo) return;
    this.toile.style.background = this.diapo.background;
    this.toile.replaceChildren(...this.diapo.objects.map((o) => rendreObjet(o, 'édition')), this.cadreDeSélection);
    this.placerSélection();
  }

  private ajuster(): void {
    const marge = 32;
    const largeur = this.element.clientWidth - marge * 2;
    const hauteur = this.element.clientHeight - marge * 2;
    if (largeur <= 0 || hauteur <= 0) return;
    this.échelle = Math.max(0.1, Math.min(largeur / SLIDE_W, hauteur / SLIDE_H));
    this.cadre.style.width = `${SLIDE_W * this.échelle}px`;
    this.cadre.style.height = `${SLIDE_H * this.échelle}px`;
    this.toile.style.transform = `scale(${this.échelle})`;
    this.toile.style.setProperty('--inverse', String(1 / this.échelle));
  }

  // ---------- Sélection ----------

  objetSélectionné(): SlideObject | null {
    return this.diapo?.objects.find((o) => o.id === this.idSélectionné) ?? null;
  }

  sélectionner(id: string | null): void {
    if (id === this.idSélectionné) return;
    this.terminerSaisie();
    this.idSélectionné = id;
    this.placerSélection();
    this.rappels.onSelect();
  }

  private placerSélection(): void {
    const o = this.objetSélectionné();
    this.cadreDeSélection.hidden = !o;
    if (o) placerObjet(this.cadreDeSélection, o);
  }

  private élément(id: string): HTMLElement | null {
    return this.toile.querySelector<HTMLElement>(`.obj[data-id="${id}"]`);
  }

  // ---------- Souris ----------

  private surPointeur(e: PointerEvent): void {
    if (e.button !== 0) return;
    const cible = e.target as HTMLElement;
    if (this.nœudEnSaisie?.contains(cible)) return; // on place le curseur dans le texte
    this.terminerSaisie();
    // Le bouton lecture d'un son ou d'une vidéo : on sélectionne l'objet, le clic fera le reste.
    if (cible.closest('.media-play')) {
      const id = cible.closest<HTMLElement>('.obj')?.dataset.id;
      if (id) this.sélectionner(id);
      this.element.focus({ preventScroll: true });
      return;
    }
    const poignée = cible.closest<HTMLElement>('.handle')?.dataset.h as Poignée | undefined;
    const objet = cible.closest<HTMLElement>('.obj');
    if (poignée && this.objetSélectionné()) this.commencerGeste(e, poignée);
    else if (objet?.dataset.id) {
      this.sélectionner(objet.dataset.id);
      this.commencerGeste(e, null);
    } else this.sélectionner(null);
    this.element.focus();
    e.preventDefault();
  }

  private commencerGeste(e: PointerEvent, poignée: Poignée | null): void {
    const objet = this.objetSélectionné();
    if (!objet) return;
    const départ = { x: e.clientX, y: e.clientY, boîte: { x: objet.x, y: objet.y, w: objet.w, h: objet.h } };
    let bougé = false;
    const glisser = (m: PointerEvent) => {
      const dx = (m.clientX - départ.x) / this.échelle;
      const dy = (m.clientY - départ.y) / this.échelle;
      if (!bougé && Math.abs(dx) + Math.abs(dy) < 2 / this.échelle) return;
      bougé = true;
      const b = départ.boîte;
      let { x, y, w, h } = b;
      if (!poignée) {
        x = b.x + dx;
        y = b.y + dy;
      } else {
        if (poignée.includes('e')) w = Math.max(TAILLE_MIN, b.w + dx);
        if (poignée.includes('s')) h = Math.max(TAILLE_MIN, b.h + dy);
        if (poignée.includes('w')) {
          w = Math.max(TAILLE_MIN, b.w - dx);
          x = b.x + b.w - w;
        }
        if (poignée.includes('n')) {
          h = Math.max(TAILLE_MIN, b.h - dy);
          y = b.y + b.h - h;
        }
      }
      Object.assign(objet, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      const élément = this.élément(objet.id);
      if (élément) placerObjet(élément, objet);
      this.placerSélection();
    };
    // Pas de « capture » du pointeur : elle redirigerait aussi le double-clic vers la scène au lieu de l'objet.
    const fin = () => {
      document.removeEventListener('pointermove', glisser);
      document.removeEventListener('pointerup', fin);
      document.removeEventListener('pointercancel', fin);
      if (bougé) this.rappels.onChange();
    };
    document.addEventListener('pointermove', glisser);
    document.addEventListener('pointerup', fin);
    document.addEventListener('pointercancel', fin);
  }

  // ---------- Texte en place ----------

  commencerSaisie(id: string): void {
    const objet = this.diapo?.objects.find((o) => o.id === id);
    const élément = this.élément(id);
    if (!objet || !élément || !aDuTexte(objet)) return;
    this.sélectionner(id);
    const nœud = nœudDeTexte(élément);
    if (!nœud) return;
    this.nœudEnSaisie = nœud;
    nœud.contentEditable = 'plaintext-only';
    nœud.classList.add('is-editing');
    nœud.focus();
    const sélection = getSelection();
    if (sélection) {
      const zone = document.createRange();
      zone.selectNodeContents(nœud);
      zone.collapse(false);
      sélection.removeAllRanges();
      sélection.addRange(zone);
    }
    nœud.addEventListener('blur', () => this.terminerSaisie(), { once: true });
    nœud.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') nœud.blur();
    });
  }

  terminerSaisie(): void {
    const nœud = this.nœudEnSaisie;
    if (!nœud) return;
    this.nœudEnSaisie = null;
    const objet = this.objetSélectionné();
    const texte = (nœud.textContent ?? '').replace(/\n$/, '');
    nœud.contentEditable = 'false';
    nœud.classList.remove('is-editing');
    if (objet && aDuTexte(objet) && objet.text !== texte) {
      objet.text = texte;
      this.rappels.onChange();
    }
  }

  get enSaisie(): boolean {
    return this.nœudEnSaisie !== null;
  }

  // ---------- Clavier ----------

  private surTouche(e: KeyboardEvent): void {
    if (this.nœudEnSaisie) return;
    const objet = this.objetSélectionné();
    const pas = e.shiftKey ? 10 : 1;
    const déplacer = (dx: number, dy: number) => {
      e.preventDefault();
      if (!objet) return;
      objet.x += dx;
      objet.y += dy;
      const élément = this.élément(objet.id);
      if (élément) placerObjet(élément, objet);
      this.placerSélection();
      this.rappels.onChange();
    };
    switch (e.key) {
      case 'ArrowLeft':
        return déplacer(-pas, 0);
      case 'ArrowRight':
        return déplacer(pas, 0);
      case 'ArrowUp':
        return déplacer(0, -pas);
      case 'ArrowDown':
        return déplacer(0, pas);
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        return this.supprimer();
      case 'Escape':
        return this.sélectionner(null);
      case 'Enter':
      case 'F2':
        if (objet) {
          e.preventDefault();
          this.commencerSaisie(objet.id);
        }
    }
  }

  // ---------- Objets ----------

  ajouter(o: SlideObject): void {
    if (!this.diapo) return;
    this.diapo.objects.push(o);
    this.dessiner();
    this.sélectionner(o.id);
    this.rappels.onChange();
  }

  supprimer(): void {
    const o = this.objetSélectionné();
    if (!o || !this.diapo) return;
    this.terminerSaisie();
    this.diapo.objects = this.diapo.objects.filter((x) => x.id !== o.id);
    this.idSélectionné = null;
    this.dessiner();
    this.rappels.onSelect();
    this.rappels.onChange();
  }

  dupliquer(): void {
    const o = this.objetSélectionné();
    if (!o || !this.diapo) return;
    const copie = cloner(o);
    copie.x += 24;
    copie.y += 24;
    this.ajouter(copie);
  }

  /** Change l'ordre d'empilement : au premier plan ou à l'arrière-plan. */
  ordonner(versLAvant: boolean): void {
    const o = this.objetSélectionné();
    if (!o || !this.diapo) return;
    this.diapo.objects = this.diapo.objects.filter((x) => x.id !== o.id);
    if (versLAvant) this.diapo.objects.push(o);
    else this.diapo.objects.unshift(o);
    this.dessiner();
    this.rappels.onChange();
  }

  /** Applique un changement à l'objet sélectionné (couleur, style du texte…) et redessine. */
  modifier(changement: (objet: SlideObject) => void): void {
    const o = this.objetSélectionné();
    if (!o) return;
    this.terminerSaisie();
    changement(o);
    this.dessiner();
    this.rappels.onChange();
  }
}
