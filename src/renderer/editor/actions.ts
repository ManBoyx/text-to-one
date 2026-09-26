import type { Editor } from '@tiptap/core';
import { construireSommaire } from '../../shared/toc';
import type { MenuAction } from '../../shared/bridge';
import type { Notice } from '../document-controller';
import { fr } from '../fr';
import type { Theme } from '../ui/theme';

/** Les actions que l'éditeur sait faire ; les menus natifs et la barre d'outils passent par les mêmes. */
export type EditorAction = Extract<MenuAction, `edit:${string}` | `insert:${string}` | `format:${string}` | `view:${string}` | 'file:print'>;

/** Les actions du traitement de texte ; les autres (tableur, présentations) ne le concernent pas. */
export const isEditorAction = (action: MenuAction): action is EditorAction => /^(edit|insert|format|view):/.test(action) || action === 'file:print';

export interface EditorUi {
  askText(options: { title: string; label: string; value?: string }): Promise<string | null>;
  pickImage(): Promise<string | null>;
  openFind(remplacer: boolean): void;
  zoom(changement: number | 'reset'): void;
  setTheme(thème: Theme): void;
  notify(notice: Notice): void;
  print(): void;
  /** Entre dans le mode concentration, ou en sort. */
  toggleFocus(): void;
  /** Choisit un fichier son ou vidéo ; null si l'utilisateur annule. */
  pickMedia(): Promise<{ src: string; title: string } | null>;
  /** Ouvre la fenêtre de saisie d'une formule ; null si l'utilisateur annule. */
  askMath(départ: { latex: string; bloc: boolean; modification: boolean }): Promise<{ latex: string; bloc: boolean } | null>;
}

/** Ajoute « https:// » quand il manque ; renvoie null si le protocole n'est pas autorisé. */
export function normaliserAdresse(saisie: string): string | null {
  const texte = saisie.trim();
  if (/^(https?|mailto|tel):/i.test(texte)) return texte;
  const avecProtocole = /^[a-z][a-z0-9+.-]*:/i.test(texte);
  const hôtePort = /^[a-z0-9.-]+:\d+/i.test(texte); // « localhost:8080 » n'est pas un protocole
  if (avecProtocole && !hôtePort) return null;
  return `https://${texte}`;
}

async function basculerLien(éditeur: Editor, ui: EditorUi): Promise<void> {
  const actuel = String(éditeur.getAttributes('link').href ?? '');
  const saisie = await ui.askText({ title: fr.dialog.linkTitle, label: fr.dialog.linkLabel, value: actuel || 'https://' });
  if (saisie === null) return;
  if (saisie.trim() === '' || saisie.trim() === 'https://') {
    éditeur.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  const adresse = normaliserAdresse(saisie);
  if (!adresse) {
    ui.notify({ kind: 'error', text: fr.dialog.linkInvalid });
    return;
  }
  if (éditeur.state.selection.empty && !éditeur.isActive('link')) {
    // Rien de sélectionné : on écrit l'adresse elle-même comme texte du lien.
    éditeur.chain().focus().insertContent({ type: 'text', text: adresse, marks: [{ type: 'link', attrs: { href: adresse } }] }).run();
    return;
  }
  éditeur.chain().focus().extendMarkRange('link').setLink({ href: adresse }).run();
}

/** Remplace la formule sélectionnée, ou insère une nouvelle formule à la sélection. */
export function modifierOuInsérerFormule(éditeur: Editor, latex: string, bloc: boolean): void {
  const { selection } = éditeur.state;
  const noeud = 'node' in selection ? (selection.node as { type: { name: string } } | undefined) : undefined;
  if (noeud && (noeud.type.name === 'mathInline' || noeud.type.name === 'mathBlock')) {
    éditeur.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, { type: bloc ? 'mathBlock' : 'mathInline', attrs: { latex } }).run();
    return;
  }
  éditeur.chain().focus().insertMath(latex, bloc).run();
}

export async function runAction(action: EditorAction, éditeur: Editor, ui: EditorUi): Promise<void> {
  const chaîne = () => éditeur.chain().focus();
  switch (action) {
    case 'file:print':
      ui.print();
      break;
    case 'edit:undo':
      chaîne().undo().run();
      break;
    case 'edit:redo':
      chaîne().redo().run();
      break;
    case 'edit:find':
      ui.openFind(false);
      break;
    case 'edit:replace':
      ui.openFind(true);
      break;
    case 'insert:image': {
      const src = await ui.pickImage();
      if (src) chaîne().setImage({ src }).run();
      break;
    }
    case 'insert:table':
      chaîne().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      break;
    case 'insert:link':
      await basculerLien(éditeur, ui);
      break;
    case 'insert:hr':
      chaîne().setHorizontalRule().run();
      break;
    case 'insert:math': {
      const { selection } = éditeur.state;
      const noeud = 'node' in selection ? (selection.node as { type: { name: string }; attrs: { latex: string } } | undefined) : undefined;
      const existante = noeud && (noeud.type.name === 'mathInline' || noeud.type.name === 'mathBlock') ? noeud : null;
      const texteSélectionné = existante ? '' : éditeur.state.doc.textBetween(selection.from, selection.to, ' ').trim();
      const résultat = await ui.askMath({
        latex: existante ? existante.attrs.latex : texteSélectionné,
        bloc: existante ? existante.type.name === 'mathBlock' : false,
        modification: existante !== null,
      });
      if (résultat) modifierOuInsérerFormule(éditeur, résultat.latex, résultat.bloc);
      break;
    }
    case 'insert:media': {
      const média = await ui.pickMedia();
      if (média) chaîne().insertMedia(média.src, média.title).run();
      break;
    }
    case 'insert:date': {
      const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      chaîne().insertContent(date).run();
      break;
    }
    case 'insert:toc': {
      const sommaire = construireSommaire(éditeur.getJSON());
      if (!sommaire) {
        ui.notify({ kind: 'info', text: fr.editor.noHeadings });
        break;
      }
      chaîne().insertContent([{ type: 'paragraph', content: [{ type: 'text', text: fr.editor.tocTitle, marks: [{ type: 'bold' }] }] }, sommaire]).run();
      break;
    }
    case 'view:focus':
      ui.toggleFocus();
      break;
    case 'insert:page-break':
      chaîne().setPageBreak().run();
      break;
    case 'format:bold':
      chaîne().toggleBold().run();
      break;
    case 'format:italic':
      chaîne().toggleItalic().run();
      break;
    case 'format:underline':
      chaîne().toggleUnderline().run();
      break;
    case 'format:strike':
      chaîne().toggleStrike().run();
      break;
    case 'format:superscript':
      chaîne().toggleSuperscript().run();
      break;
    case 'format:subscript':
      chaîne().toggleSubscript().run();
      break;
    case 'format:align-left':
      chaîne().setTextAlign('left').run();
      break;
    case 'format:align-center':
      chaîne().setTextAlign('center').run();
      break;
    case 'format:align-right':
      chaîne().setTextAlign('right').run();
      break;
    case 'format:align-justify':
      chaîne().setTextAlign('justify').run();
      break;
    case 'format:bullet-list':
      chaîne().toggleBulletList().run();
      break;
    case 'format:ordered-list':
      chaîne().toggleOrderedList().run();
      break;
    case 'format:task-list':
      chaîne().toggleTaskList().run();
      break;
    case 'format:blockquote':
      chaîne().toggleBlockquote().run();
      break;
    case 'format:clear':
      chaîne().unsetAllMarks().clearNodes().run();
      break;
    case 'view:zoom-in':
      ui.zoom(10);
      break;
    case 'view:zoom-out':
      ui.zoom(-10);
      break;
    case 'view:zoom-reset':
      ui.zoom('reset');
      break;
    case 'view:theme-light':
      ui.setTheme('light');
      break;
    case 'view:theme-dark':
      ui.setTheme('dark');
      break;
    case 'view:theme-system':
      ui.setTheme('system');
      break;
  }
}
