import { describe, expect, it } from 'vitest';
import { toHtmlDocument, toMarkdown, toPlainText } from '../../src/formats/export-text';
import { sampleDoc } from './sample-doc';

describe('export en texte brut', () => {
  const texte = toPlainText(sampleDoc);

  it('sépare les blocs par une ligne vide et finit par un retour à la ligne', () => {
    expect(texte.startsWith('Titre principal\n\nTexte gras, italique, souligné, barré et rouge surligné avec un lien.\n\n')).toBe(true);
    expect(texte.endsWith('\n')).toBe(true);
  });

  it('écrit les listes avec leurs marques et leurs retraits', () => {
    expect(texte).toContain('• premier\n  • imbriqué\n• second');
    expect(texte).toContain('1. un\n2. deux');
    expect(texte).toContain('[x] fait\n[ ] à faire');
  });

  it('sépare les cellules des tableaux par une tabulation', () => {
    expect(texte).toContain('En-tête\tH3');
    expect(texte).toContain('A\tB\tC');
  });

  it('renvoie un texte vide pour un document vide', () => {
    expect(toPlainText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('\n');
    expect(toPlainText({ type: 'doc' })).toBe('');
  });
});

describe('export en Markdown', () => {
  const md = toMarkdown(sampleDoc);

  it('écrit titres et mise en forme', () => {
    expect(md.startsWith('# Titre principal\n\n')).toBe(true);
    expect(md).toContain('Texte **gras**, *italique*, souligné, ~~barré~~ et rouge surligné avec un [lien](https://exemple.fr).');
  });

  it('écrit les listes, les tâches, la citation, le code et la ligne de séparation', () => {
    expect(md).toContain('- premier\n  - imbriqué\n- second');
    expect(md).toContain('1. un\n2. deux');
    expect(md).toContain('- [x] fait\n- [ ] à faire');
    expect(md).toContain('> Une citation');
    expect(md).toContain('```\nligne 1\nligne 2\n```');
    expect(md).toContain('\n---\n');
  });

  it('écrit les tableaux au format GFM et marque le saut de page', () => {
    expect(md).toContain('| A | B | C |');
    expect(md).toContain('| --- | --- | --- |');
    expect(md).toContain('<!-- saut de page -->');
  });

  it("n'embarque pas les images et échappe les caractères spéciaux", () => {
    expect(md).toContain('Image : ![un pixel]()');
    expect(md).not.toContain('data:image');
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2 * 3 = [6]' }] }] };
    expect(toMarkdown(doc)).toBe('2 \\* 3 = \\[6\\]\n');
  });

  it("garde les espaces hors des marques de gras", () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: ' mot ' }] }] };
    expect(toMarkdown(doc)).toBe(' **mot** \n');
  });
});

describe('export en page HTML', () => {
  const html = toHtmlDocument(sampleDoc, 'Bilan & projets');

  it('produit un document complet en français', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>Bilan &amp; projets</title>');
  });

  it('garde la mise en forme, le tableau, le saut de page et les images intégrées', () => {
    expect(html).toContain('<strong>gras</strong>');
    expect(html).toContain('<table');
    expect(html).toContain('class="page-break"');
    expect(html).toContain('data:image/png;base64');
    expect(html).not.toContain('<script');
  });
});
