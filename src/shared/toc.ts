import type { JSONContent } from '@tiptap/core';

const texteDe = (n: JSONContent): string => (n.type === 'text' ? (n.text ?? '') : (n.content ?? []).map(texteDe).join(''));

/** Ce qu'on met en tête d'un sommaire, et jusqu'à quel niveau de titre on descend. */
export const NIVEAU_MAX_SOMMAIRE = 3;

/**
 * Le sommaire d'un document : une liste à puces des titres (niveaux 1 à 3), emboîtée selon leur niveau.
 * Renvoie null s'il n'y a aucun titre. C'est une photographie : il faut le réinsérer pour le mettre à jour.
 */
export function construireSommaire(doc: JSONContent): JSONContent | null {
  const titres = (doc.content ?? [])
    .filter((n) => n.type === 'heading' && Number(n.attrs?.level ?? 1) <= NIVEAU_MAX_SOMMAIRE)
    .map((n) => ({ niveau: Number(n.attrs?.level ?? 1), texte: texteDe(n).trim() }))
    .filter((t) => t.texte !== '');
  if (!titres.length) return null;

  const racine: JSONContent = { type: 'bulletList', content: [] };
  // La pile garde, pour chaque profondeur ouverte, la liste dans laquelle on ajoute les titres de ce niveau.
  const pile: { niveau: number; liste: JSONContent }[] = [{ niveau: titres[0].niveau, liste: racine }];
  for (const titre of titres) {
    while (pile.length > 1 && titre.niveau < pile[pile.length - 1].niveau) pile.pop();
    let courant = pile[pile.length - 1];
    if (titre.niveau > courant.niveau) {
      const dernier = courant.liste.content?.[courant.liste.content.length - 1];
      if (dernier) {
        const sous: JSONContent = { type: 'bulletList', content: [] };
        dernier.content = [...(dernier.content ?? []), sous];
        courant = { niveau: titre.niveau, liste: sous };
        pile.push(courant);
      }
    }
    courant.liste.content = [...(courant.liste.content ?? []), { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: titre.texte }] }] }];
  }
  return racine;
}
