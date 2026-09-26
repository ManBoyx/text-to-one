import { Film, Music, Pause, Play } from 'lucide';
import { SLIDE_H, SLIDE_W, type MediaObject, type ShapeObject, type Slide, type SlideObject, type TextObject } from '../../formats/slides/model';
import { adresseMédiaValide, créerLecteur } from '../../shared/media';
import { fr } from '../fr';
import { el, icône } from '../ui/dom';

/**
 * Où l'on dessine : « miniature » (vignettes et impression) ne charge jamais les sons et vidéos, « édition » les
 * montre avec un bouton lecture, « présentation » leur donne leurs commandes complètes.
 */
export type ModeDeRendu = 'miniature' | 'édition' | 'présentation';

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
/** Le bloc d'un son ou d'une vidéo, selon l'endroit où l'on dessine. */
function rendreMédia(o: MediaObject, mode: ModeDeRendu): HTMLElement {
  const élément = el('div', `obj obj-media obj-media-${o.kind}`);
  const titre = el('div', 'media-title', o.title);
  const repère = el('span', 'media-icon');
  repère.append(icône(o.kind === 'video' ? Film : Music));
  if (mode === 'miniature' || !adresseMédiaValide(o.src)) {
    élément.append(repère, titre);
    return élément;
  }
  const lecteur = créerLecteur(o.src, o.title, mode === 'présentation');
  lecteur.classList.add('media-player');
  if (mode === 'présentation') {
    élément.append(...(o.kind === 'audio' ? [repère, titre] : []), lecteur);
    return élément;
  }
  // En édition : pas de commandes natives (elles gêneraient le déplacement), un seul bouton lecture / pause.
  const bouton = el('button', 'media-play');
  bouton.type = 'button';
  bouton.setAttribute('aria-label', fr.media.play);
  const majBouton = () => {
    const lit = !lecteur.paused;
    bouton.replaceChildren(icône(lit ? Pause : Play));
    bouton.setAttribute('aria-label', lit ? fr.media.pause : fr.media.play);
  };
  majBouton();
  lecteur.addEventListener('play', majBouton);
  lecteur.addEventListener('pause', majBouton);
  lecteur.addEventListener('ended', majBouton);
  bouton.addEventListener('click', () => (lecteur.paused ? void lecteur.play().catch(() => undefined) : lecteur.pause()));
  élément.append(...(o.kind === 'audio' ? [repère] : []), titre, lecteur, bouton);
  return élément;
}

export function rendreObjet(o: SlideObject, mode: ModeDeRendu = 'miniature'): HTMLElement {
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
  } else if (o.type === 'media') {
    élément = rendreMédia(o, mode);
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
export function rendreDiapo(diapo: Slide, mode: ModeDeRendu = 'miniature'): HTMLElement {
  const conteneur = el('div', 'slide');
  conteneur.style.width = `${SLIDE_W}px`;
  conteneur.style.height = `${SLIDE_H}px`;
  conteneur.style.background = diapo.background;
  for (const o of diapo.objects) conteneur.append(rendreObjet(o, mode));
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
