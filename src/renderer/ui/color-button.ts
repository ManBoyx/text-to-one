import { icône, el } from './dom';
import { attacherPopup } from './popup';

type Icône = Parameters<typeof icône>[0];

export const PALETTE = ['#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff', '#e03131', '#f76707', '#f59f00', '#2f9e44', '#1971c2', '#7048e8', '#c2255c', '#0c8599'];

export interface OptionsBoutonCouleur {
  icône: Icône;
  titre: string;
  classe: string;
  aucune: string;
  autre: string;
  courante(): string | null;
  appliquer(couleur: string | null): void;
}

/** Un bouton qui ouvre une palette : quatorze couleurs, « aucune », et le sélecteur du système. */
export function créerBoutonCouleur(o: OptionsBoutonCouleur): { element: HTMLButtonElement; refresh(): void } {
  const b = el('button', `tb-btn tb-color ${o.classe}`);
  b.type = 'button';
  b.title = o.titre;
  b.setAttribute('aria-label', o.titre);
  b.append(icône(o.icône));
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
        o.appliquer(couleur);
        fermer();
      });
      grille.append(pastille);
    }
    const aucune = el('button', 'popup-item', o.aucune);
    aucune.type = 'button';
    aucune.addEventListener('mousedown', (e) => e.preventDefault());
    aucune.addEventListener('click', () => {
      o.appliquer(null);
      fermer();
    });
    const autre = el('label', 'popup-item', o.autre);
    const entrée = el('input');
    entrée.type = 'color';
    entrée.value = o.courante() ?? '#000000';
    entrée.addEventListener('change', () => {
      o.appliquer(entrée.value);
      fermer();
    });
    autre.append(entrée);
    menu.append(grille, aucune, autre);
    return menu;
  });
  return { element: b, refresh: () => b.style.setProperty('--tb-couleur', o.courante() ?? 'transparent') };
}
