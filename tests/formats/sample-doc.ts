import type { JSONContent } from '@tiptap/core';

/** PNG de 1 × 1 pixel. */
export const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
/** GIF de 1 × 1 pixel. */
export const GIF_1PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const texte = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const para = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const cellule = (type: 'tableCell' | 'tableHeader', text: string, colspan = 1, rowspan = 1): JSONContent => ({
  type, attrs: { colspan, rowspan }, content: [para(texte(text))],
});

/** Un document qui utilise tout ce que la version 1 sait faire. */
export const sampleDoc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [texte('Titre principal')] },
    { type: 'paragraph', attrs: { textAlign: 'center', lineHeight: '1.5' }, content: [
      texte('Texte '), texte('gras', [{ type: 'bold' }]), texte(', '), texte('italique', [{ type: 'italic' }]), texte(', '),
      texte('souligné', [{ type: 'underline' }]), texte(', '), texte('barré', [{ type: 'strike' }]), texte(' et '),
      texte('rouge', [{ type: 'textStyle', attrs: { color: '#ff0000' } }]), texte(' '),
      texte('surligné', [{ type: 'highlight', attrs: { color: '#ffff00' } }]), texte(' avec un '),
      texte('lien', [{ type: 'link', attrs: { href: 'https://exemple.fr' } }]), texte('.'),
    ] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [para(texte('premier')), { type: 'bulletList', content: [{ type: 'listItem', content: [para(texte('imbriqué'))] }] }] },
      { type: 'listItem', content: [para(texte('second'))] },
    ] },
    { type: 'orderedList', content: [
      { type: 'listItem', content: [para(texte('un'))] },
      { type: 'listItem', content: [para(texte('deux'))] },
    ] },
    { type: 'taskList', content: [
      { type: 'taskItem', attrs: { checked: true }, content: [para(texte('fait'))] },
      { type: 'taskItem', attrs: { checked: false }, content: [para(texte('à faire'))] },
    ] },
    { type: 'blockquote', content: [para(texte('Une citation'))] },
    { type: 'codeBlock', content: [texte('ligne 1\nligne 2')] },
    { type: 'horizontalRule' },
    { type: 'table', content: [
      { type: 'tableRow', content: [cellule('tableHeader', 'En-tête', 2), cellule('tableHeader', 'H3')] },
      { type: 'tableRow', content: [cellule('tableCell', 'A', 1, 2), cellule('tableCell', 'B'), cellule('tableCell', 'C')] },
      { type: 'tableRow', content: [cellule('tableCell', 'D'), cellule('tableCell', 'E')] },
    ] },
    { type: 'pageBreak' },
    para(texte('Image : '), { type: 'image', attrs: { src: PNG_1PX, alt: 'un pixel', width: 40, height: 40 } }),
  ],
};
