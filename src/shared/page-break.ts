import { Node } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insère un saut de page (visible seulement à l'impression et dans le PDF). */
      setPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },

  renderHTML() {
    return ['div', { 'data-page-break': '', class: 'page-break' }];
  },

  addCommands() {
    return {
      setPageBreak: () => ({ commands }) => commands.insertContent({ type: this.name }),
    };
  },
});
