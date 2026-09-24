import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { Recherche, lireRecherche, trouverOccurrences } from '../../src/renderer/editor/search';
import { buildExtensions } from '../../src/shared/schema';

let éditeur: Editor | null = null;

function créer(contenu: string): Editor {
  éditeur = new Editor({ element: document.createElement('div'), extensions: [...buildExtensions(), Recherche], content: contenu });
  return éditeur;
}

afterEach(() => {
  éditeur?.destroy();
  éditeur = null;
});

const texte = (e: Editor) => e.state.doc.textContent;

describe('recherche', () => {
  it('trouve toutes les occurrences, sans tenir compte de la casse par défaut', () => {
    const e = créer('<p>Chat chat chien</p><p>un CHAT</p>');
    expect(trouverOccurrences(e.state.doc, 'chat', false)).toHaveLength(3);
    expect(trouverOccurrences(e.state.doc, 'chat', true)).toHaveLength(1);
    expect(trouverOccurrences(e.state.doc, '', false)).toEqual([]);
    expect(trouverOccurrences(e.state.doc, 'introuvable', false)).toEqual([]);
  });

  it('trouve un mot coupé par des changements de style', () => {
    const e = créer('<p><strong>bon</strong>jour <em>tout</em> le monde</p>');
    expect(trouverOccurrences(e.state.doc, 'bonjour', false)).toHaveLength(1);
    expect(trouverOccurrences(e.state.doc, 'tout le', false)).toHaveLength(1);
  });

  it('compte, surligne et fait défiler les occurrences en boucle', () => {
    const e = créer('<p>chat chat chien</p>');
    e.commands.setSearch('chat');
    expect(lireRecherche(e)).toMatchObject({ terme: 'chat', index: 0 });
    expect(lireRecherche(e).occurrences).toHaveLength(2);
    expect(e.view.dom.querySelectorAll('.search-match')).toHaveLength(2);
    expect(e.view.dom.querySelectorAll('.search-match-current')).toHaveLength(1);
    e.commands.nextMatch();
    expect(lireRecherche(e).index).toBe(1);
    e.commands.nextMatch();
    expect(lireRecherche(e).index).toBe(0);
    e.commands.previousMatch();
    expect(lireRecherche(e).index).toBe(1);
  });

  it("remplace l'occurrence courante, puis toutes les autres", () => {
    const e = créer('<p>chat chat chien</p>');
    e.commands.setSearch('chat');
    e.commands.replaceCurrent('lion');
    expect(texte(e)).toBe('lion chat chien');
    expect(lireRecherche(e).occurrences).toHaveLength(1);
    e.commands.replaceAll('tigre');
    expect(texte(e)).toBe('lion tigre chien');
    expect(lireRecherche(e).occurrences).toHaveLength(0);
  });

  it('remplace tout, même quand le remplacement change la longueur du texte', () => {
    const e = créer('<p>a a a</p><p>a</p>');
    e.commands.setSearch('a');
    e.commands.replaceAll('bravo');
    expect(texte(e)).toBe('bravo bravo bravobravo');
  });

  it('garde la mise en forme du texte remplacé', () => {
    const e = créer('<p>un <strong>chat</strong> noir</p>');
    e.commands.setSearch('chat');
    e.commands.replaceAll('lion');
    expect(e.getHTML()).toContain('<strong>lion</strong>');
  });

  it('remplace par rien pour supprimer', () => {
    const e = créer('<p>un chat noir</p>');
    e.commands.setSearch('chat ');
    e.commands.replaceAll('');
    expect(texte(e)).toBe('un noir');
  });

  it('met à jour les résultats quand le texte change, et s\'efface', () => {
    const e = créer('<p>chat</p>');
    e.commands.setSearch('chat');
    e.commands.insertContentAt(5, ' chat');
    expect(lireRecherche(e).occurrences).toHaveLength(2);
    e.commands.clearSearch();
    expect(lireRecherche(e)).toMatchObject({ terme: '', index: -1 });
    expect(e.view.dom.querySelectorAll('.search-match')).toHaveLength(0);
  });

  it('ne fait rien quand il n\'y a aucun résultat', () => {
    const e = créer('<p>chat</p>');
    e.commands.setSearch('zèbre');
    expect(e.commands.nextMatch()).toBe(false);
    expect(e.commands.replaceAll('x')).toBe(false);
    expect(texte(e)).toBe('chat');
  });
});
