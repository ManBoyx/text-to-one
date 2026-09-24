export interface Popup {
  toggle(): void;
  close(): void;
}

/**
 * Attache un petit menu flottant à un bouton. `construire` fabrique le contenu à chaque ouverture
 * (pour refléter l'état actuel) et reçoit la fonction qui referme le menu.
 */
export function attacherPopup(bouton: HTMLElement, construire: (fermer: () => void) => HTMLElement): Popup {
  let ouvert: HTMLElement | null = null;

  function dehors(événement: Event): void {
    const cible = événement.target as Node;
    if (ouvert && !ouvert.contains(cible) && !bouton.contains(cible)) fermer();
  }

  function touche(événement: KeyboardEvent): void {
    if (événement.key === 'Escape') {
      fermer();
      bouton.focus();
    }
  }

  function fermer(): void {
    if (!ouvert) return;
    ouvert.remove();
    ouvert = null;
    bouton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', dehors, true);
    document.removeEventListener('keydown', touche, true);
  }

  function ouvrir(): void {
    ouvert = construire(fermer);
    ouvert.classList.add('popup');
    document.body.append(ouvert);
    const boîte = bouton.getBoundingClientRect();
    ouvert.style.left = `${Math.max(8, Math.min(boîte.left, window.innerWidth - ouvert.offsetWidth - 8))}px`;
    ouvert.style.top = `${boîte.bottom + 4}px`;
    bouton.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', dehors, true);
    document.addEventListener('keydown', touche, true);
  }

  bouton.setAttribute('aria-haspopup', 'true');
  bouton.setAttribute('aria-expanded', 'false');
  bouton.addEventListener('click', () => (ouvert ? fermer() : ouvrir()));
  return { toggle: () => (ouvert ? fermer() : ouvrir()), close: fermer };
}
