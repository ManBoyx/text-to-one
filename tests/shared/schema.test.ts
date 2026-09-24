import { getSchema } from '@tiptap/core';
import { generateHTML, generateJSON } from '@tiptap/html';
import { describe, expect, it } from 'vitest';
import { buildExtensions } from '../../src/shared/schema';

const extensions = buildExtensions();
const schema = getSchema(extensions);

describe('schéma du document', () => {
  it('connaît tous les blocs de la version 1', () => {
    const blocs = ['doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'taskItem', 'listItem',
      'blockquote', 'codeBlock', 'horizontalRule', 'hardBreak', 'table', 'tableRow', 'tableCell', 'tableHeader',
      'image', 'pageBreak'];
    for (const nom of blocs) expect(schema.nodes[nom], nom).toBeDefined();
  });

  it('connaît toutes les marques de la version 1', () => {
    const marques = ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'highlight', 'link', 'textStyle', 'code'];
    for (const nom of marques) expect(schema.marks[nom], nom).toBeDefined();
  });

  it('ne garde que les images intégrées au document', () => {
    const json = generateJSON('<p>a<img src="https://exemple.fr/x.png"><img src="data:image/png;base64,AAAA"></p>', extensions);
    const images = (json.content?.[0]?.content ?? []).filter((n: { type?: string }) => n.type === 'image');
    expect(images).toHaveLength(1);
    expect(images[0]?.attrs?.src).toBe('data:image/png;base64,AAAA');
  });

  it('nettoie un contenu collé dangereux', () => {
    const collé = '<p>ok</p><script>alert(1)</script><style>p{color:red}</style><p onclick="pirate()">b</p>'
      + '<a href="javascript:alert(2)">piège</a><iframe src="https://exemple.fr"></iframe>';
    const texte = JSON.stringify(generateJSON(collé, extensions));
    expect(texte).toContain('ok');
    expect(texte).toContain('piège');
    for (const interdit of ['alert', 'pirate', 'javascript', 'iframe', 'onclick']) expect(texte).not.toContain(interdit);
  });

  it("garde l'alignement et l'interligne d'un paragraphe", () => {
    const json = generateJSON('<p style="text-align: center; line-height: 1.5">a</p>', extensions);
    expect(json.content?.[0]?.attrs).toMatchObject({ textAlign: 'center', lineHeight: '1.5' });
    const html = generateHTML(json, extensions);
    expect(html).toContain('text-align: center');
    expect(html).toContain('line-height: 1.5');
  });

  it('garde texte, mise en forme et saut de page après un aller-retour HTML', () => {
    const source = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'Titre' }] },
        { type: 'paragraph', content: [
          { type: 'text', marks: [{ type: 'bold' }], text: 'gras' },
          { type: 'text', text: ' et ' },
          { type: 'text', marks: [{ type: 'textStyle', attrs: { color: '#ff0000' } }], text: 'rouge' },
        ] },
        { type: 'pageBreak' },
      ],
    };
    const une = generateJSON(generateHTML(source, extensions), extensions);
    const deux = generateJSON(generateHTML(une, extensions), extensions);
    expect(deux).toEqual(une);
    expect(JSON.stringify(une)).toContain('"color":"#ff0000"');
    expect(une.content?.[2]?.type).toBe('pageBreak');
  });
});
