export const SLIDE_W = 960;
export const SLIDE_H = 540;
export const MAX_SLIDES = 500;
export const MAX_OBJECTS = 300;

export type Align = 'left' | 'center' | 'right';
export type ShapeKind = 'rect' | 'ellipse';
export type Layout = 'title' | 'content' | 'blank';

export interface TextStyle {
  /** Taille en pixels de la diapositive (960 de large). */
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: Align;
}

interface ObjetDeBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextObject extends ObjetDeBase {
  type: 'text';
  text: string;
  style: TextStyle;
}

export interface ShapeObject extends ObjetDeBase {
  type: 'shape';
  shape: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  /** Texte écrit dans la forme, centré. */
  text: string;
  style: TextStyle;
}

export interface ImageObject extends ObjetDeBase {
  type: 'image';
  /** Adresse « data: » de l'image pendant l'édition ; « media/… » dans le fichier. */
  src: string;
  alt: string;
}

export type SlideObject = TextObject | ShapeObject | ImageObject;

export interface Slide {
  id: string;
  background: string;
  objects: SlideObject[];
}

export interface SlidesDoc {
  slides: Slide[];
}

export const COULEUR_TEXTE = '#1d2330';
export const COULEUR_ACCENT = '#2456d6';

export function nouvelId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const styleDeTexte = (extra: Partial<TextStyle> = {}): TextStyle => ({
  size: 28,
  bold: false,
  italic: false,
  underline: false,
  color: COULEUR_TEXTE,
  align: 'left',
  ...extra,
});

export function zoneDeTexte(x: number, y: number, w: number, h: number, text: string, style: Partial<TextStyle> = {}): TextObject {
  return { id: nouvelId(), type: 'text', x, y, w, h, text, style: styleDeTexte(style) };
}

export function forme(shape: ShapeKind, x: number, y: number, w: number, h: number): ShapeObject {
  return {
    id: nouvelId(),
    type: 'shape',
    shape,
    x,
    y,
    w,
    h,
    fill: COULEUR_ACCENT,
    stroke: null,
    strokeWidth: 2,
    text: '',
    style: styleDeTexte({ color: '#ffffff', align: 'center', size: 24 }),
  };
}

/** Une diapositive neuve avec sa mise en page. */
export function nouvelleDiapo(layout: Layout = 'content'): Slide {
  const objets: SlideObject[] = [];
  if (layout === 'title') {
    objets.push(zoneDeTexte(80, 170, 800, 110, 'Titre de la présentation', { size: 56, bold: true, align: 'center' }));
    objets.push(zoneDeTexte(80, 300, 800, 60, 'Sous-titre', { size: 28, align: 'center', color: '#5b6678' }));
  } else if (layout === 'content') {
    objets.push(zoneDeTexte(60, 40, 840, 90, 'Titre', { size: 42, bold: true }));
    objets.push(zoneDeTexte(60, 150, 840, 340, '• Premier point\n• Deuxième point', { size: 30 }));
  }
  return { id: nouvelId(), background: '#ffffff', objects: objets };
}

export const présentationParDéfaut = (): SlidesDoc => ({ slides: [nouvelleDiapo('title')] });

/** Copie profonde avec de nouveaux identifiants (dupliquer une diapositive ou un objet). */
export function cloner<T extends Slide | SlideObject>(élément: T): T {
  const copie = JSON.parse(JSON.stringify(élément)) as T;
  copie.id = nouvelId();
  if ('objects' in copie) for (const o of copie.objects) o.id = nouvelId();
  return copie;
}

/** L'historique « annuler » : un instantané du document après chaque action. */
export class Historique<T> {
  private instantanés: string[];
  private position = 0;

  constructor(initial: T, private readonly max = 100) {
    this.instantanés = [JSON.stringify(initial)];
  }

  reset(valeur: T): void {
    this.instantanés = [JSON.stringify(valeur)];
    this.position = 0;
  }

  commit(valeur: T): boolean {
    const instantané = JSON.stringify(valeur);
    if (instantané === this.instantanés[this.position]) return false;
    this.instantanés = [...this.instantanés.slice(0, this.position + 1), instantané].slice(-this.max);
    this.position = this.instantanés.length - 1;
    return true;
  }

  canUndo = (): boolean => this.position > 0;
  canRedo = (): boolean => this.position < this.instantanés.length - 1;

  undo(): T | null {
    return this.canUndo() ? (JSON.parse(this.instantanés[--this.position]) as T) : null;
  }

  redo(): T | null {
    return this.canRedo() ? (JSON.parse(this.instantanés[++this.position]) as T) : null;
  }
}
