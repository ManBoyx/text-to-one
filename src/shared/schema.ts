import type { Extensions } from '@tiptap/core';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { StarterKit } from '@tiptap/starter-kit';
import { LineSpacing } from './line-spacing';
import { PageBreak } from './page-break';

/** Seules les images intégrées au document sont acceptées : aucune image distante n'est jamais chargée. */
const InlineImage = Image.extend({
  parseHTML() {
    return [{ tag: 'img[src^="data:image/"]' }];
  },
});

/** Le schéma du document, partagé par l'éditeur et par tous les convertisseurs de formats. */
export function buildExtensions(): Extensions {
  return [
    StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
    TextStyleKit.configure({ lineHeight: false, backgroundColor: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    LineSpacing,
    PageBreak,
    TaskList,
    TaskItem.configure({
      nested: true,
      // TipTap écrit ce libellé (lu par les lecteurs d'écran) en anglais par défaut.
      a11y: { checkboxLabel: (noeud) => `Case à cocher : ${noeud.textContent || 'tâche vide'}` },
    }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    InlineImage.configure({ inline: true, allowBase64: true }),
  ];
}
