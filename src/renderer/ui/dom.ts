import { createElement } from 'lucide';

type Icône = Parameters<typeof createElement>[0];

/** Crée un élément avec sa classe et son texte : évite de répéter trois lignes partout. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const noeud = document.createElement(tag);
  if (className) noeud.className = className;
  if (text !== undefined) noeud.textContent = text;
  return noeud;
}

/** Une icône de la bibliothèque lucide, masquée aux lecteurs d'écran (le bouton porte le nom). */
export function icône(donnée: Icône, taille = 18): SVGElement {
  return createElement(donnée, { width: taille, height: taille, 'aria-hidden': 'true', focusable: 'false' });
}
