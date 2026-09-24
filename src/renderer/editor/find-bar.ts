import type { Editor } from '@tiptap/core';
import { CaseSensitive, ChevronDown, ChevronUp, X } from 'lucide';
import { el, icône } from '../ui/dom';
import { fr } from '../fr';
import { lireRecherche } from './search';

export interface BarreRecherche {
  element: HTMLElement;
  /** Ouvre la barre ; avec `remplacer`, montre aussi la ligne de remplacement. */
  open(remplacer: boolean): void;
  close(): void;
  /** Efface les surlignages sans fermer la barre (avant d'exporter en PDF, par exemple). */
  clear(): void;
}

export function créerBarreRecherche(éditeur: Editor): BarreRecherche {
  const barre = el('div', 'findbar');
  barre.hidden = true;
  barre.setAttribute('role', 'search');

  const bouton = (classe: string, titre: string, contenu: SVGElement | string): HTMLButtonElement => {
    const b = el('button', classe);
    b.type = 'button';
    b.title = titre;
    b.setAttribute('aria-label', titre);
    if (typeof contenu === 'string') b.textContent = contenu;
    else b.append(contenu);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    return b;
  };

  const champ = el('input', 'find-input');
  champ.type = 'text';
  champ.placeholder = fr.find.label;
  champ.setAttribute('aria-label', fr.find.label);
  champ.spellcheck = false;
  const casse = bouton('tb-btn find-case', fr.find.matchCase, icône(CaseSensitive));
  casse.setAttribute('aria-pressed', 'false');
  const précédent = bouton('tb-btn', fr.find.previous, icône(ChevronUp));
  const suivant = bouton('tb-btn', fr.find.next, icône(ChevronDown));
  const compteur = el('span', 'find-count');
  compteur.setAttribute('aria-live', 'polite');
  const fermer = bouton('tb-btn', fr.find.close, icône(X));
  const ligneRecherche = el('div', 'find-row');
  ligneRecherche.append(champ, casse, précédent, suivant, compteur, fermer);

  const remplacement = el('input', 'find-input');
  remplacement.type = 'text';
  remplacement.placeholder = fr.find.replaceWith;
  remplacement.setAttribute('aria-label', fr.find.replaceWith);
  remplacement.spellcheck = false;
  const remplacerUn = bouton('btn', fr.find.replaceOne, fr.find.replaceOne);
  const remplacerTout = bouton('btn', fr.find.replaceAll, fr.find.replaceAll);
  const ligneRemplacement = el('div', 'find-row');
  ligneRemplacement.hidden = true;
  ligneRemplacement.append(remplacement, remplacerUn, remplacerTout);

  barre.append(ligneRecherche, ligneRemplacement);

  const respecterCasse = () => casse.getAttribute('aria-pressed') === 'true';

  const actualiser = () => {
    const état = lireRecherche(éditeur);
    const aucun = état.occurrences.length === 0;
    compteur.textContent = !champ.value ? '' : aucun ? fr.find.none : fr.find.count(état.index + 1, état.occurrences.length);
    for (const b of [précédent, suivant, remplacerUn, remplacerTout]) b.disabled = aucun;
  };

  const chercher = () => {
    éditeur.commands.setSearch(champ.value, respecterCasse());
    éditeur.commands.revealMatch();
    actualiser();
  };

  champ.addEventListener('input', chercher);
  casse.addEventListener('click', () => {
    casse.setAttribute('aria-pressed', String(!respecterCasse()));
    casse.classList.toggle('is-active', respecterCasse());
    chercher();
  });
  suivant.addEventListener('click', () => {
    éditeur.commands.nextMatch();
    actualiser();
  });
  précédent.addEventListener('click', () => {
    éditeur.commands.previousMatch();
    actualiser();
  });
  remplacerUn.addEventListener('click', () => {
    éditeur.commands.replaceCurrent(remplacement.value);
    éditeur.commands.revealMatch();
    actualiser();
  });
  remplacerTout.addEventListener('click', () => {
    éditeur.commands.replaceAll(remplacement.value);
    actualiser();
  });
  champ.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    (e.shiftKey ? précédent : suivant).click();
  });
  barre.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fermerBarre();
  });
  fermer.addEventListener('click', () => fermerBarre());
  éditeur.on('transaction', () => {
    if (!barre.hidden) actualiser();
  });

  function fermerBarre(): void {
    barre.hidden = true;
    éditeur.commands.clearSearch();
    éditeur.commands.focus();
  }

  return {
    element: barre,
    open(remplacer) {
      barre.hidden = false;
      ligneRemplacement.hidden = !remplacer;
      const { from, to, empty } = éditeur.state.selection;
      const sélection = empty ? '' : éditeur.state.doc.textBetween(from, to, ' ');
      if (sélection && sélection.length <= 100 && !sélection.includes('\n')) champ.value = sélection;
      chercher();
      champ.focus();
      champ.select();
    },
    close: fermerBarre,
    clear() {
      éditeur.commands.clearSearch();
      actualiser();
    },
  };
}
