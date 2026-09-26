import { Editor, type JSONContent } from '@tiptap/core';
import { CharacterCount } from '@tiptap/extensions';
import { buildExtensions } from '../../shared/schema';
import type { Notice } from '../document-controller';
import { fr } from '../fr';
import { Recherche } from './search';

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;

const TYPES_IMAGE = /^image\/(png|jpeg|gif|webp|bmp)$/;

export function lireEnAdresse(fichier: File): Promise<string> {
  return new Promise((résoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => résoudre(String(lecteur.result));
    lecteur.onerror = () => rejeter(lecteur.error);
    lecteur.readAsDataURL(fichier);
  });
}

const imagesDe = (liste: FileList | null | undefined): File[] => Array.from(liste ?? []).filter((f) => TYPES_IMAGE.test(f.type));

export function créerÉditeur(élément: HTMLElement, notify: (notice: Notice) => void, surFormule?: (position: number) => void): Editor {
  const éditeur: Editor = new Editor({
    element: élément,
    extensions: [...buildExtensions({ onEdit: surFormule }), CharacterCount, Recherche],
    content: EMPTY_DOC,
    editorProps: {
      attributes: {
        class: 'document',
        spellcheck: 'true',
        lang: 'fr',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': fr.editor.label,
      },
      handlePaste: (_vue, événement) => {
        const fichiers = imagesDe(événement.clipboardData?.files);
        if (!fichiers.length) return false; // le reste du contenu collé est nettoyé par le schéma
        void insérer(fichiers, null);
        return true;
      },
      handleDrop: (vue, événement) => {
        const fichiers = imagesDe(événement.dataTransfer?.files);
        if (!fichiers.length) return false;
        événement.preventDefault();
        const position = vue.posAtCoords({ left: événement.clientX, top: événement.clientY })?.pos ?? null;
        void insérer(fichiers, position);
        return true;
      },
    },
  });

  async function insérer(fichiers: File[], position: number | null): Promise<void> {
    let où = position;
    for (const fichier of fichiers) {
      if (fichier.size > IMAGE_MAX_BYTES) {
        notify({ kind: 'error', text: fr.notice.imageTooBig });
        continue;
      }
      const src = await lireEnAdresse(fichier);
      const chaîne = éditeur.chain().focus();
      if (où !== null) chaîne.setTextSelection(où);
      chaîne.setImage({ src, alt: fichier.name.replace(/\.[^.]+$/, '') }).run();
      où = null; // les images suivantes se placent à la suite
    }
  }

  return éditeur;
}
