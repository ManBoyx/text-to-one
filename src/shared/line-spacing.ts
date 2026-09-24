import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineSpacing: {
      /** Règle l'interligne des paragraphes et titres sélectionnés (« 1.5 » par exemple). */
      setLineHeight: (value: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

/** L'interligne appartient au paragraphe, comme dans Word, et non au texte. */
export const LineSpacing = Extension.create<{ types: string[] }>({
  name: 'lineSpacing',

  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => (attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight: (value) => ({ commands }) =>
        this.options.types.map((type) => commands.updateAttributes(type, { lineHeight: value })).some(Boolean),
      unsetLineHeight: () => ({ commands }) =>
        this.options.types.map((type) => commands.resetAttributes(type, 'lineHeight')).some(Boolean),
    };
  },
});
