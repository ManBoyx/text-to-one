import type { Editor, JSONContent } from '@tiptap/core';
import { ZoomIn, ZoomOut } from 'lucide';
import type { Bridge, MenuAction, OpenedFile } from '../../shared/bridge';
import { DocumentController, type Notice } from '../document-controller';
import { fr } from '../fr';
import { askText } from '../ui/dialog';
import { choisirMédia } from '../ui/media-picker';
import { ouvrirFormule } from './math-dialog';
import { el, icône } from '../ui/dom';
import { setTheme } from '../ui/theme';
import { showNotice } from '../ui/toast';
import { isEditorAction, runAction, type EditorUi } from './actions';
import { IMAGE_MAX_BYTES, créerÉditeur, lireEnAdresse } from './create-editor';
import { créerBarreRecherche } from './find-bar';
import { créerBarreOutils } from './toolbar';

export interface EditorSession {
  readonly editor: Editor;
  readonly controller: DocumentController;
  newDocument(): void;
  openFile(fichier: OpenedFile): Promise<boolean>;
  openRecovered(id: string, nom: string, octets: Uint8Array): Promise<boolean>;
  handleMenu(action: MenuAction): Promise<void>;
  dispose(): void;
}

/** Remplace tout le contenu sans l'ajouter à l'historique « annuler » ni le compter comme une modification. */
function remplacerContenu(éditeur: Editor, doc: JSONContent): void {
  const noeud = éditeur.schema.nodeFromJSON(doc);
  noeud.check(); // lève une erreur si le document ne respecte pas le schéma
  const tr = éditeur.state.tr
    .replaceWith(0, éditeur.state.doc.content.size, noeud.content)
    .setMeta('addToHistory', false)
    .setMeta('preventUpdate', true);
  éditeur.view.dispatch(tr);
}

function choisirImage(notify: (notice: Notice) => void): Promise<string | null> {
  return new Promise((résoudre) => {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = 'image/png,image/jpeg,image/gif,image/webp,image/bmp';
    champ.hidden = true;
    const finir = (valeur: string | null) => {
      champ.remove();
      résoudre(valeur);
    };
    champ.addEventListener('change', async () => {
      const fichier = champ.files?.[0];
      if (!fichier) return finir(null);
      if (fichier.size > IMAGE_MAX_BYTES) {
        notify({ kind: 'error', text: fr.notice.imageTooBig });
        return finir(null);
      }
      finir(await lireEnAdresse(fichier));
    });
    champ.addEventListener('cancel', () => finir(null));
    document.body.append(champ);
    champ.click();
  });
}

export function créerSession(hôte: HTMLElement, bridge: Bridge, options: { id?: string } = {}): EditorSession {
  hôte.replaceChildren();
  const notify = (notice: Notice) => showNotice(notice);

  const racine = el('div', 'editor-view');
  const espace = el('div', 'workspace');
  const feuille = el('div', 'sheet');
  const zoneÉditeur = el('div', 'sheet-content');
  feuille.append(zoneÉditeur);
  espace.append(feuille);

  let modifierFormule: (position: number) => void = () => {};
  const éditeur = créerÉditeur(zoneÉditeur, notify, (position) => modifierFormule(position));
  const recherche = créerBarreRecherche(éditeur);

  // Barre d'état : compteurs et zoom
  const barreÉtat = el('div', 'statusbar');
  const compteur = el('span', 'status-count');
  const zoomBarre = el('div', 'status-zoom');
  const boutonZoom = (classe: string, titre: string, contenu: SVGElement): HTMLButtonElement => {
    const b = el('button', `tb-btn ${classe}`);
    b.type = 'button';
    b.title = titre;
    b.setAttribute('aria-label', titre);
    b.append(contenu);
    return b;
  };
  const moins = boutonZoom('zoom-out', fr.status.zoomOut, icône(ZoomOut, 16));
  const plus = boutonZoom('zoom-in', fr.status.zoomIn, icône(ZoomIn, 16));
  const libellé = el('button', 'zoom-label', '100 %');
  libellé.type = 'button';
  libellé.title = fr.status.zoomReset;
  zoomBarre.append(moins, libellé, plus);
  barreÉtat.append(compteur, zoomBarre);

  let zoom = 100;
  const appliquerZoom = () => {
    feuille.style.setProperty('--zoom', String(zoom / 100));
    libellé.textContent = `${zoom} %`;
  };
  const changerZoom = (changement: number | 'reset') => {
    zoom = changement === 'reset' ? 100 : Math.min(200, Math.max(50, zoom + changement));
    appliquerZoom();
  };
  moins.addEventListener('click', () => changerZoom(-10));
  plus.addEventListener('click', () => changerZoom(10));
  libellé.addEventListener('click', () => changerZoom('reset'));
  espace.addEventListener(
    'wheel',
    (événement) => {
      if (!événement.ctrlKey) return;
      événement.preventDefault();
      changerZoom(événement.deltaY < 0 ? 10 : -10);
    },
    { passive: false },
  );

  const majCompteur = () => {
    const stockage = éditeur.storage.characterCount as { words(): number; characters(): number };
    compteur.textContent = `${fr.status.words(stockage.words())} · ${fr.status.chars(stockage.characters())}`;
  };

  const ui: EditorUi = {
    askText: (o) => askText({ ...o, confirm: fr.dialog.ok, cancel: fr.dialog.cancel }),
    pickImage: () => choisirImage(notify),
    openFind: (remplacer) => recherche.open(remplacer),
    zoom: changerZoom,
    setTheme,
    notify,
    askMath: ouvrirFormule,
    toggleFocus: () => basculerConcentration(),
    pickMedia: () => choisirMédia(notify),
    print: () => {
      recherche.clear(); // les surlignages de recherche ne doivent pas se retrouver sur le papier
      bridge.print();
    },
  };
  // Un double-clic sur une formule la sélectionne et rouvre la fenêtre de saisie.
  modifierFormule = (position) => {
    éditeur.chain().focus().setNodeSelection(position).run();
    void runAction('insert:math', éditeur, ui);
  };
  const barreOutils = créerBarreOutils(éditeur, ui);

  // Mode concentration : plus que la feuille ; Échap ou le bouton flottant en sortent.
  const sortieConcentration = el('button', 'focus-exit', fr.editor.focusExit);
  sortieConcentration.type = 'button';
  sortieConcentration.addEventListener('click', () => basculerConcentration());
  function basculerConcentration(): void {
    const actif = racine.classList.toggle('is-focus');
    sortieConcentration.hidden = !actif;
    éditeur.commands.focus();
  }
  sortieConcentration.hidden = true;
  racine.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && racine.classList.contains('is-focus') && !recherche.element.contains(e.target as Node)) basculerConcentration();
  });

  const contrôleur = new DocumentController<JSONContent>({
    bridge,
    getDoc: () => éditeur.getJSON(),
    setDoc: (doc) => remplacerContenu(éditeur, doc),
    notify,
    newId: options.id ? () => options.id as string : undefined,
    onState: (état) => {
      racine.dataset.dirty = String(état.dirty);
      racine.dataset.name = état.name;
    },
  });

  racine.append(barreOutils.element, recherche.element, espace, barreÉtat, sortieConcentration);
  hôte.append(racine);

  éditeur.on('update', () => {
    contrôleur.markDirty();
    majCompteur();
  });
  // Un clic sur un lien ne quitte jamais la fenêtre : Ctrl + clic l'ouvre dans le navigateur du système.
  zoneÉditeur.addEventListener('click', (événement) => {
    const lien = (événement.target as HTMLElement).closest('a[href]');
    if (!lien) return;
    événement.preventDefault();
    if (événement.ctrlKey || événement.metaKey) bridge.openExternal((lien as HTMLAnchorElement).href);
  });

  const rafraîchir = () => {
    majCompteur();
    barreOutils.refresh();
    éditeur.commands.focus('start');
  };
  appliquerZoom();
  rafraîchir();
  contrôleur.startAutosave();

  return {
    editor: éditeur,
    controller: contrôleur,
    newDocument: rafraîchir,
    async openFile(fichier) {
      const ouvert = await contrôleur.open(fichier);
      rafraîchir();
      return ouvert;
    },
    async openRecovered(_id, nom, octets) {
      const ouvert = await contrôleur.openRecovered(nom, octets);
      rafraîchir();
      return ouvert;
    },
    async handleMenu(action) {
      switch (action) {
        case 'file:save':
          await contrôleur.save();
          break;
        case 'file:save-as':
          await contrôleur.saveAs();
          break;
        case 'file:export-docx':
          await contrôleur.exportAs('docx');
          break;
        case 'file:export-html':
          await contrôleur.exportAs('html');
          break;
        case 'file:export-txt':
          await contrôleur.exportAs('txt');
          break;
        case 'file:export-md':
          await contrôleur.exportAs('md');
          break;
        case 'file:export-pdf':
          recherche.clear(); // les surlignages de recherche ne doivent pas se retrouver dans le PDF
          await contrôleur.exportPdf();
          break;
        case 'app:save-and-close':
          if (await contrôleur.save()) bridge.closeWindow();
          break;
        default:
          if (isEditorAction(action)) await runAction(action, éditeur, ui);
      }
    },
    dispose() {
      contrôleur.dispose();
      éditeur.destroy();
    },
  };
}
