import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { construireSommaire } from '../../src/shared/toc';

const titre = (niveau: number, texte: string): JSONContent => ({ type: 'heading', attrs: { level: niveau }, content: texte ? [{ type: 'text', text: texte }] : [] });
const doc = (...blocs: JSONContent[]): JSONContent => ({ type: 'doc', content: blocs });
const lire = (liste: JSONContent | null): unknown =>
  liste?.content?.map((item) => {
    const [paragraphe, sous] = item.content ?? [];
    return sous ? [paragraphe.content?.[0].text, lire(sous)] : paragraphe.content?.[0].text;
  });

describe('sommaire', () => {
  it("renvoie null quand il n'y a aucun titre", () => {
    expect(construireSommaire(doc({ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour' }] }))).toBeNull();
    expect(construireSommaire(doc(titre(1, '')))).toBeNull();
  });

  it('emboîte les titres selon leur niveau', () => {
    const liste = construireSommaire(doc(titre(1, 'A'), titre(2, 'A1'), titre(2, 'A2'), titre(3, 'A2a'), titre(1, 'B'), titre(2, 'B1')));
    expect(lire(liste)).toEqual([['A', ['A1', ['A2', ['A2a']]]], ['B', ['B1']]]);
  });

  it('ignore les niveaux au-delà de 3 et les titres vides', () => {
    expect(lire(construireSommaire(doc(titre(1, 'A'), titre(4, 'trop profond'), titre(2, '   '), titre(2, 'B'))))).toEqual([['A', ['B']]]);
  });

  it('un document qui commence par un titre de niveau 2 donne une liste valide, à plat', () => {
    expect(lire(construireSommaire(doc(titre(2, 'X'), titre(1, 'Y'), titre(2, 'Z'))))).toEqual(['X', 'Y', 'Z']);
  });
});
