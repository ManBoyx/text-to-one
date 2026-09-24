import type { Notice } from '../document-controller';
import { el } from './dom';

/** Affiche un message court en bas à droite ; un clic le ferme, les erreurs restent plus longtemps. */
export function showNotice(notice: Notice, hôte: HTMLElement = document.body): void {
  let pile = hôte.querySelector<HTMLElement>(':scope > .toasts');
  if (!pile) {
    pile = el('div', 'toasts');
    pile.setAttribute('role', 'status');
    pile.setAttribute('aria-live', 'polite');
    hôte.append(pile);
  }
  const carte = el('div', `toast toast-${notice.kind}`, notice.text);
  const fermer = () => carte.remove();
  carte.addEventListener('click', fermer);
  pile.append(carte);
  setTimeout(fermer, notice.kind === 'error' ? 12_000 : 6_000);
}
