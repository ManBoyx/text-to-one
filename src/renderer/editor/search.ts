import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as NoeudPM } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface Occurrence {
  from: number;
  to: number;
}

export interface EtatRecherche {
  terme: string;
  respecterCasse: boolean;
  occurrences: Occurrence[];
  /** Position de l'occurrence courante dans `occurrences`, ou -1 s'il n'y en a pas. */
  index: number;
}

interface MétaRecherche {
  terme?: string;
  respecterCasse?: boolean;
  index?: number;
}

const clé = new PluginKey<EtatRecherche>('tto-recherche');
const VIDE: EtatRecherche = { terme: '', respecterCasse: false, occurrences: [], index: -1 };

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    recherche: {
      setSearch: (terme: string, respecterCasse?: boolean) => ReturnType;
      nextMatch: () => ReturnType;
      previousMatch: () => ReturnType;
      revealMatch: () => ReturnType;
      replaceCurrent: (remplacement: string) => ReturnType;
      replaceAll: (remplacement: string) => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
}

/** Cherche dans chaque bloc de texte en entier : un mot coupé par du gras ou de l'italique est bien trouvé. */
export function trouverOccurrences(doc: NoeudPM, terme: string, respecterCasse: boolean): Occurrence[] {
  const cherché = respecterCasse ? terme : terme.toLowerCase();
  if (!terme || cherché.length !== terme.length) return [];
  const résultats: Occurrence[] = [];
  doc.descendants((noeud, position) => {
    if (!noeud.isTextblock) return true;
    // Chaque élément qui n'est pas du texte (image, saut de ligne) compte pour un caractère, comme une position.
    const texte = noeud.textBetween(0, noeud.content.size, undefined, '￼');
    const meule = respecterCasse ? texte : texte.toLowerCase();
    if (meule.length === texte.length) {
      let i = meule.indexOf(cherché);
      while (i !== -1) {
        résultats.push({ from: position + 1 + i, to: position + 1 + i + terme.length });
        i = meule.indexOf(cherché, i + cherché.length);
      }
    }
    return false;
  });
  return résultats;
}

export function lireRecherche(éditeur: Editor): EtatRecherche {
  return clé.getState(éditeur.state) ?? VIDE;
}

function sélectionner(état: EditorState, tr: Transaction, occurrence: Occurrence): void {
  tr.setSelection(TextSelection.create(état.doc, occurrence.from, occurrence.to)).scrollIntoView();
}

function déplacer(état: EditorState, tr: Transaction, envoyer: boolean, sens: 1 | -1): boolean {
  const s = clé.getState(état);
  if (!s || !s.occurrences.length) return false;
  const index = (s.index + sens + s.occurrences.length) % s.occurrences.length;
  if (envoyer) {
    tr.setMeta(clé, { index } satisfies MétaRecherche);
    sélectionner(état, tr, s.occurrences[index]);
  }
  return true;
}

/** Remplace en gardant la mise en forme du texte remplacé (gras, couleur, lien…). */
function remplacer(tr: Transaction, occurrence: Occurrence, remplacement: string): void {
  if (!remplacement) {
    tr.delete(occurrence.from, occurrence.to);
    return;
  }
  const marques = tr.doc.resolve(occurrence.from).marksAcross(tr.doc.resolve(occurrence.to)) ?? [];
  tr.replaceWith(occurrence.from, occurrence.to, tr.doc.type.schema.text(remplacement, marques));
}

export const Recherche = Extension.create({
  name: 'recherche',

  addProseMirrorPlugins() {
    return [
      new Plugin<EtatRecherche>({
        key: clé,
        state: {
          init: () => VIDE,
          apply(tr, ancien, _ancienEtat, nouvelEtat) {
            const méta = tr.getMeta(clé) as MétaRecherche | undefined;
            if (!méta && !tr.docChanged) return ancien;
            const terme = méta?.terme ?? ancien.terme;
            const respecterCasse = méta?.respecterCasse ?? ancien.respecterCasse;
            const occurrences = trouverOccurrences(nouvelEtat.doc, terme, respecterCasse);
            let index = méta?.index ?? ancien.index;
            if (!occurrences.length) index = -1;
            else if (index < 0 || index >= occurrences.length) index = 0;
            return { terme, respecterCasse, occurrences, index };
          },
        },
        props: {
          decorations(état) {
            const s = clé.getState(état);
            if (!s || !s.occurrences.length) return DecorationSet.empty;
            return DecorationSet.create(
              état.doc,
              s.occurrences.map((o, i) =>
                Decoration.inline(o.from, o.to, { class: i === s.index ? 'search-match search-match-current' : 'search-match' }),
              ),
            );
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSearch:
        (terme, respecterCasse = false) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(clé, { terme, respecterCasse, index: 0 } satisfies MétaRecherche);
          return true;
        },
      nextMatch:
        () =>
        ({ state, tr, dispatch }) =>
          déplacer(state, tr, !!dispatch, 1),
      previousMatch:
        () =>
        ({ state, tr, dispatch }) =>
          déplacer(state, tr, !!dispatch, -1),
      revealMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const s = clé.getState(state);
          if (!s || s.index < 0) return false;
          if (dispatch) sélectionner(state, tr, s.occurrences[s.index]);
          return true;
        },
      replaceCurrent:
        (remplacement) =>
        ({ state, tr, dispatch }) => {
          const s = clé.getState(state);
          if (!s || s.index < 0) return false;
          if (dispatch) remplacer(tr, s.occurrences[s.index], remplacement);
          return true;
        },
      replaceAll:
        (remplacement) =>
        ({ state, tr, dispatch }) => {
          const s = clé.getState(state);
          if (!s || !s.occurrences.length) return false;
          // De la fin vers le début, pour que les positions restantes ne bougent pas.
          if (dispatch) for (const o of [...s.occurrences].reverse()) remplacer(tr, o, remplacement);
          return true;
        },
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(clé, { terme: '', index: -1 } satisfies MétaRecherche);
          return true;
        },
    };
  },
});
