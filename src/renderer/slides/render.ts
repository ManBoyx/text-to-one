import { SLIDE_H, SLIDE_W, type ShapeObject, type Slide, type SlideObject, type TextObject } from '../../formats/slides/model';
import { el } from '../ui/dom';

function styleDuTexte(élément: HTMLElement, o: TextObject | ShapeObject): void {
  const s = o.style;
  élément.style.fontSize = `${s.size}px`;
  élément.style.fontWeight = s.bold ? '700' : '400';
  élément.style.fontStyle = s.italic ? 'italic' : 'normal';
  élément.style.textDecoration = s.underline ? 'underline' : 'none';
  élément.style.color = s.color;
  élément.style.textAlign = s.align;
}

/** Le nœud dans lequel on écrit le texte d'un objet (l'objet lui-même, ou l'intérieur d'une forme). */
export function nœudDeTexte(élément: HTMLElement): HTMLElement | null {
  return élément.classList.contains('obj-text') ? élément : élément.querySelector<HTMLElement>('.obj-shape-text');
}

export function placerObjet(élément: HTMLElement, o: SlideObject): void {
  élément.style.left = `${o.x}px`;
  élément.style.top = `${o.y}px`;
  élément.style.width = `${o.w}px`;
  élément.style.height = `${o.h}px`;
}

/** Fabrique l'élément d'un objet de diapositive, aux dimensions de la diapositive (960 × 540). */
export function rendreObjet(o: SlideObject): HTMLElement {
  let élément: HTMLElement;
  if (o.type === 'text') {
    élément = el('div', 'obj obj-text', o.text);
    styleDuTexte(élément, o);
  } else if (o.type === 'shape') {
    élément = el('div', 'obj obj-shape');
    élément.style.background = o.fill ?? 'transparent';
    élément.style.border = o.stroke && o.strokeWidth > 0 ? `${o.strokeWidth}px solid ${o.stroke}` : 'none';
    if (o.shape === 'ellipse') élément.style.borderRadius = '50%';
    const texte = el('div', 'obj-shape-text', o.text);
    styleDuTexte(texte, o);
    élément.append(texte);
  } else {
    élément = el('div', 'obj obj-image');
    const image = el('img');
    image.src = o.src;
    image.alt = o.alt;
    image.draggable = false;
    élément.append(image);
  }
  élément.dataset.id = o.id;
  placerObjet(élément, o);
  return élément;
}

/** Une diapositive complète, à sa taille réelle : on la réduit ou l'agrandit avec `transform: scale`. */
export function rendreDiapo(diapo: Slide): HTMLElement {
  const conteneur = el('div', 'slide');
  conteneur.style.width = `${SLIDE_W}px`;
  conteneur.style.height = `${SLIDE_H}px`;
  conteneur.style.background = diapo.background;
  for (const o of diapo.objects) conteneur.append(rendreObjet(o));
  return conteneur;
}

/** Une diapositive réduite dans une boîte de la taille voulue (miniature). */
export function miniature(diapo: Slide, largeur: number): HTMLElement {
  const échelle = largeur / SLIDE_W;
  const boîte = el('div', 'thumb-frame');
  boîte.style.width = `${largeur}px`;
  boîte.style.height = `${SLIDE_H * échelle}px`;
  const rendu = rendreDiapo(diapo);
  rendu.style.transform = `scale(${échelle})`;
  boîte.append(rendu);
  return boîte;
}
