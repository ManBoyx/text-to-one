import { InputRule, Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import katex from 'katex';

/** Longueur maximale d'une formule : au-delà, on refuse (une formule n'a pas besoin de plus). */
export const MATH_MAX_LENGTH = 2000;

/** Les réglages de KaTeX : aucune commande dangereuse (liens, images, styles libres) et des garde-fous contre les formules géantes. */
const OPTIONS_KATEX = { trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 30, throwOnError: false } as const;

/** Vrai si KaTeX sait lire cette formule. */
export function formuleValide(latex: string): boolean {
  if (!latex.trim() || latex.length > MATH_MAX_LENGTH) return false;
  try {
    katex.renderToString(latex, { ...OPTIONS_KATEX, throwOnError: true });
    return true;
  } catch {
    return false;
  }
}

/** Le message d'erreur de KaTeX pour une formule invalide, ou null si elle est valide. */
export function erreurFormule(latex: string): string | null {
  if (!latex.trim()) return null;
  if (latex.length > MATH_MAX_LENGTH) return `La formule est trop longue (${MATH_MAX_LENGTH} caractères au plus).`;
  try {
    katex.renderToString(latex, { ...OPTIONS_KATEX, throwOnError: true });
    return null;
  } catch (erreur) {
    return String((erreur as Error).message ?? erreur).replace(/^KaTeX parse error:\s*/, '');
  }
}

/** Dessine la formule dans l'élément (HTML pour l'œil, MathML pour les lecteurs d'écran). Une formule invalide s'affiche en rouge, telle quelle. */
export function dessinerFormule(élément: HTMLElement, latex: string, bloc: boolean): void {
  katex.render(latex.slice(0, MATH_MAX_LENGTH), élément, { ...OPTIONS_KATEX, displayMode: bloc, output: 'htmlAndMathml', errorColor: 'var(--danger, #b42318)' });
}

/** La formule en MathML pur, sans feuille de style ni police : pour les pages web exportées, que les navigateurs affichent eux-mêmes. */
export function formuleEnMathML(latex: string, bloc: boolean): string {
  return katex.renderToString(latex.slice(0, MATH_MAX_LENGTH), { ...OPTIONS_KATEX, displayMode: bloc, output: 'mathml' });
}

/** L'arbre de KaTeX (utile aux convertisseurs) ; null si la formule est invalide. */
export function analyserFormule(latex: string): unknown[] | null {
  try {
    return (katex as unknown as { __parse(l: string, o: object): unknown[] }).__parse(latex, { ...OPTIONS_KATEX, throwOnError: true });
  } catch {
    return null;
  }
}

export interface OptionsMath {
  /** Appelé quand on double-clique une formule dans l'éditeur (position du nœud) : l'interface ouvre la fenêtre de modification. */
  onEdit?: (position: number) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    math: {
      /** Insère une formule à la sélection : dans le texte, ou sur sa propre ligne. */
      insertMath: (latex: string, bloc: boolean) => ReturnType;
    };
  }
}

const attributLatex = {
  latex: {
    default: '',
    parseHTML: (élément: HTMLElement) => élément.getAttribute('data-latex') ?? '',
    renderHTML: (attributs: Record<string, unknown>) => ({ 'data-latex': String(attributs.latex ?? '') }),
  },
};

/** Lit le LaTeX d'une formule KaTeX collée depuis une page web (elle le garde dans une balise « annotation »). */
const latexDeKatex = (élément: HTMLElement): string | false => {
  const latex = élément.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
  return latex && latex.length <= MATH_MAX_LENGTH ? latex : false;
};

function vueDeFormule(bloc: boolean, options: () => OptionsMath) {
  return ({ node, getPos }: { node: { attrs: Record<string, unknown> }; getPos: () => number | undefined }) => {
    const dom = document.createElement(bloc ? 'div' : 'span');
    dom.className = bloc ? 'math-block' : 'math-inline';
    dom.contentEditable = 'false';
    dom.setAttribute('role', 'math');
    let dernière = '';
    const dessiner = (latex: string) => {
      if (latex === dernière) return;
      dernière = latex;
      dom.setAttribute('aria-label', latex);
      dessinerFormule(dom, latex, bloc);
    };
    dessiner(String(node.attrs.latex ?? ''));
    dom.addEventListener('dblclick', (événement) => {
      événement.preventDefault();
      const position = getPos();
      if (position !== undefined) options().onEdit?.(position);
    });
    return {
      dom,
      update: (autre: { type: unknown; attrs: Record<string, unknown> }) => {
        if (autre.type !== (node as unknown as { type: unknown }).type) return false;
        dessiner(String(autre.attrs.latex ?? ''));
        return true;
      },
      ignoreMutation: () => true, // c'est KaTeX qui écrit dans l'élément, pas l'utilisateur
    };
  };
}

/** Une formule dans le texte : `$x^2$` la crée pendant la frappe. */
export const MathInline = Node.create<OptionsMath>({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  addOptions: () => ({}),
  addAttributes: () => attributLatex,
  parseHTML() {
    return [
      { tag: 'span[data-math="inline"]' },
      { tag: 'span.katex', getAttrs: (e) => (latexDeKatex(e as HTMLElement) ? { latex: latexDeKatex(e as HTMLElement) } : false), priority: 60 },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'math-inline', 'data-math': 'inline' }), String(node.attrs.latex ?? '')];
  },
  addNodeView() {
    return vueDeFormule(false, () => this.options);
  },
  addCommands() {
    return {
      insertMath:
        (latex, bloc) =>
        ({ commands }) =>
          commands.insertContent({ type: bloc ? 'mathBlock' : 'mathInline', attrs: { latex } }),
    };
  },
  addInputRules() {
    return [
      // « $x^2$ » : pas d'espace juste après le premier « $ » ni juste avant le second, pour ne pas confondre avec des prix.
      nodeInputRule({ find: /(?:^|[^$\\])(\$([^\s$](?:[^$\n]*[^\s$])?)\$)$/, type: this.type, getAttributes: (m) => ({ latex: m[2] }) }),
    ];
  },
});

/** Une formule sur sa propre ligne, centrée : `$$x^2$$` seul dans un paragraphe la crée. */
export const MathBlock = Node.create<OptionsMath>({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addOptions: () => ({}),
  addAttributes: () => attributLatex,
  parseHTML() {
    return [
      { tag: 'div[data-math="block"]' },
      { tag: 'span.katex-display', getAttrs: (e) => (latexDeKatex(e as HTMLElement) ? { latex: latexDeKatex(e as HTMLElement) } : false), priority: 70 },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'math-block', 'data-math': 'block' }), String(node.attrs.latex ?? '')];
  },
  addNodeView() {
    return vueDeFormule(true, () => this.options);
  },
  addInputRules() {
    return [new InputRule({
      find: /^\$\$([^$\n]+)\$\$$/,
      handler: ({ state, range, match, chain }) => {
        const latex = match[1].trim();
        if (!latex || latex.length > MATH_MAX_LENGTH) return null;
        const $début = state.doc.resolve(range.from);
        // Le paragraphe entier devient la formule (le « $$ » final n'est pas encore dans le document : la règle porte sur la ligne écrite).
        chain().insertContentAt({ from: $début.before(), to: $début.after() }, [{ type: this.name, attrs: { latex } }, { type: 'paragraph' }]).run();
        return undefined;
      },
    })];
  },
});
