import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  BringToFront,
  Bold,
  Circle,
  Copy,
  CopyPlus,
  Image as IcôneImage,
  Italic,
  Layers,
  MoveDown,
  MoveUp,
  PaintBucket,
  Play,
  Plus,
  Redo2,
  SendToBack,
  Square,
  Trash2,
  Type,
  Underline,
  Undo2,
} from 'lucide';
import { slidesCodec } from '../../formats/slides';
import { Historique, cloner, forme, nouvelleDiapo, présentationParDéfaut, zoneDeTexte, SLIDE_H, SLIDE_W, type Layout, type SlidesDoc, type TextStyle } from '../../formats/slides/model';
import type { Bridge, MenuAction, OpenedFile } from '../../shared/bridge';
import type { AppSession } from '../app-session';
import { DocumentController, type Notice } from '../document-controller';
import { IMAGE_MAX_BYTES, lireEnAdresse } from '../editor/create-editor';
import { fr } from '../fr';
import { créerBoutonCouleur } from '../ui/color-button';
import { el, icône } from '../ui/dom';
import { showNotice } from '../ui/toast';
import { miniature, rendreDiapo } from './render';
import { Scène } from './scene';

type Icône = Parameters<typeof icône>[0];
const TAILLES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96];
const LARGEUR_MINIATURE = 168;

export interface SessionPrésentation extends AppSession {
  readonly controller: DocumentController<SlidesDoc>;
  readonly scène: Scène;
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

function tailleNaturelle(adresse: string): Promise<{ w: number; h: number }> {
  return new Promise((résoudre) => {
    const image = new Image();
    image.onload = () => résoudre({ w: image.naturalWidth || 300, h: image.naturalHeight || 200 });
    image.onerror = () => résoudre({ w: 300, h: 200 });
    image.src = adresse;
  });
}

export function créerSessionPrésentation(hôte: HTMLElement, bridge: Bridge, options: { id?: string } = {}): SessionPrésentation {
  hôte.replaceChildren();
  const notify = (notice: Notice) => showNotice(notice);
  const racine = el('div', 'slides-app');
  const impression = el('div', 'print-slides');
  const àActualiser: Array<() => void> = [];
  let doc: SlidesDoc = présentationParDéfaut();
  let courante = 0;
  const historique = new Historique<SlidesDoc>(doc);
  const diapo = () => doc.slides[courante];

  const contrôleur = new DocumentController<SlidesDoc>({
    bridge,
    codec: slidesCodec,
    getDoc: () => doc,
    setDoc: (nouveau) => {
      doc = nouveau;
      courante = 0;
      historique.reset(doc);
      rafraîchir();
    },
    notify,
    newId: options.id ? () => options.id as string : undefined,
    onState: (état) => {
      racine.dataset.dirty = String(état.dirty);
      racine.dataset.name = état.name;
    },
  });

  const scène = new Scène({
    onChange: () => valider(),
    onSelect: () => actualiserOutils(),
  });

  // ----- Volet des miniatures
  const panneau = el('div', 'sl-panel');
  panneau.setAttribute('role', 'listbox');
  panneau.setAttribute('aria-label', fr.slides.panel);
  const dessinerMiniatures = () => {
    panneau.replaceChildren(
      ...doc.slides.map((d, i) => {
        const b = el('button', `thumb${i === courante ? ' is-current' : ''}`);
        b.type = 'button';
        b.dataset.index = String(i);
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', String(i === courante));
        b.setAttribute('aria-label', fr.slides.thumb(i + 1));
        b.append(miniature(d, LARGEUR_MINIATURE), el('span', 'thumb-number', String(i + 1)));
        b.addEventListener('click', () => aller(i));
        return b;
      }),
    );
  };

  // ----- Barre d'état
  const barreÉtat = el('div', 'statusbar');
  const statut = el('span', 'status-count');
  barreÉtat.append(statut);

  // ----- Enchaînement des changements
  const rafraîchir = () => {
    courante = Math.max(0, Math.min(courante, doc.slides.length - 1));
    scène.afficher(diapo());
    dessinerMiniatures();
    actualiserOutils();
  };
  /** Une action de l'utilisateur est terminée : historique, marque « modifié », miniatures. */
  const valider = () => {
    historique.commit(doc);
    contrôleur.markDirty();
    dessinerMiniatures();
    actualiserOutils();
  };
  const aller = (i: number) => {
    if (i < 0 || i >= doc.slides.length || i === courante) return;
    courante = i;
    rafraîchir();
  };
  const restaurer = (précédent: SlidesDoc | null) => {
    if (!précédent) return;
    doc = précédent;
    rafraîchir();
    contrôleur.markDirty();
  };

  // ----- Barre d'outils
  const barre = el('div', 'toolbar');
  barre.setAttribute('role', 'toolbar');
  barre.setAttribute('aria-label', fr.slides.label);
  const groupe = (): HTMLElement => {
    const g = el('div', 'tb-group');
    barre.append(g);
    return g;
  };
  const bouton = (parent: HTMLElement, action: MenuAction, icon: Icône, titre: string, actif?: () => boolean, actifSi?: () => boolean): HTMLButtonElement => {
    const b = el('button', 'tb-btn');
    b.type = 'button';
    b.title = titre;
    b.setAttribute('aria-label', titre);
    b.dataset.action = action;
    b.append(icône(icon));
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => void gérerMenu(action));
    àActualiser.push(() => {
      if (actif) {
        const état = actif();
        b.classList.toggle('is-active', état);
        b.setAttribute('aria-pressed', String(état));
      }
      if (actifSi) b.disabled = !actifSi();
    });
    parent.append(b);
    return b;
  };
  const objet = () => scène.objetSélectionné();
  const avecTexte = () => {
    const o = objet();
    return !!o && o.type !== 'image';
  };
  const avecFormeSeulement = () => objet()?.type === 'shape';
  const style = (): TextStyle | null => {
    const o = objet();
    return o && o.type !== 'image' ? o.style : null;
  };
  const styliser = (patch: Partial<TextStyle>) =>
    scène.modifier((o) => {
      if (o.type !== 'image') Object.assign(o.style, patch);
    });

  const g1 = groupe();
  bouton(g1, 'edit:undo', Undo2, fr.slides.toolbar.undo, undefined, () => historique.canUndo());
  bouton(g1, 'edit:redo', Redo2, fr.slides.toolbar.redo, undefined, () => historique.canRedo());

  const g2 = groupe();
  bouton(g2, 'slides:new-slide', Plus, fr.slides.toolbar.newSlide);
  const miseEnPage = el('select', 'tb-select sl-layout');
  miseEnPage.title = fr.slides.toolbar.layout;
  miseEnPage.setAttribute('aria-label', fr.slides.toolbar.layout);
  for (const [valeur, libellé] of [['content', fr.slides.toolbar.layoutContent], ['title', fr.slides.toolbar.layoutTitle], ['blank', fr.slides.toolbar.layoutBlank]]) {
    const option = el('option', undefined, libellé);
    option.value = valeur;
    miseEnPage.append(option);
  }
  g2.append(miseEnPage);
  bouton(g2, 'slides:duplicate-slide', CopyPlus, fr.slides.toolbar.duplicateSlide);
  bouton(g2, 'slides:delete-slide', Trash2, fr.slides.toolbar.deleteSlide);
  bouton(g2, 'slides:move-up', MoveUp, fr.slides.toolbar.moveUp, undefined, () => courante > 0);
  bouton(g2, 'slides:move-down', MoveDown, fr.slides.toolbar.moveDown, undefined, () => courante < doc.slides.length - 1);

  const g3 = groupe();
  bouton(g3, 'slides:insert-text', Type, fr.slides.toolbar.insertText);
  bouton(g3, 'slides:insert-rect', Square, fr.slides.toolbar.insertRect);
  bouton(g3, 'slides:insert-ellipse', Circle, fr.slides.toolbar.insertEllipse);
  bouton(g3, 'slides:insert-image', IcôneImage, fr.slides.toolbar.insertImage);

  const g4 = groupe();
  const taille = el('select', 'tb-select sl-size');
  taille.title = fr.slides.toolbar.size;
  taille.setAttribute('aria-label', fr.slides.toolbar.size);
  for (const t of TAILLES) {
    const option = el('option', undefined, String(t));
    option.value = String(t);
    taille.append(option);
  }
  taille.addEventListener('change', () => {
    styliser({ size: Number(taille.value) });
    scène.element.focus();
  });
  àActualiser.push(() => {
    const s = style();
    taille.disabled = !s;
    if (s && ![...taille.options].some((o) => o.value === String(s.size))) {
      const option = el('option', undefined, String(s.size));
      option.value = String(s.size);
      taille.append(option);
    }
    taille.value = String(s?.size ?? 28);
  });
  g4.append(taille);
  bouton(g4, 'format:bold', Bold, fr.slides.toolbar.bold, () => !!style()?.bold, avecTexte);
  bouton(g4, 'format:italic', Italic, fr.slides.toolbar.italic, () => !!style()?.italic, avecTexte);
  const souligné = el('button', 'tb-btn');
  souligné.type = 'button';
  souligné.title = fr.slides.toolbar.underline;
  souligné.setAttribute('aria-label', fr.slides.toolbar.underline);
  souligné.dataset.action = 'format:underline';
  souligné.append(icône(Underline));
  souligné.addEventListener('mousedown', (e) => e.preventDefault());
  souligné.addEventListener('click', () => styliser({ underline: !style()?.underline }));
  àActualiser.push(() => {
    souligné.disabled = !avecTexte();
    souligné.classList.toggle('is-active', !!style()?.underline);
  });
  g4.append(souligné);
  bouton(g4, 'format:align-left', AlignLeft, fr.slides.toolbar.alignLeft, () => style()?.align === 'left', avecTexte);
  bouton(g4, 'format:align-center', AlignCenter, fr.slides.toolbar.alignCenter, () => style()?.align === 'center', avecTexte);
  bouton(g4, 'format:align-right', AlignRight, fr.slides.toolbar.alignRight, () => style()?.align === 'right', avecTexte);

  const g5 = groupe();
  const couleurs: { icône: Icône; titre: string; classe: string; lire: () => string | null; écrire: (c: string | null) => void }[] = [
    { icône: Baseline, titre: fr.slides.toolbar.textColor, classe: 'tb-text-color', lire: () => style()?.color ?? null, écrire: (c) => c && styliser({ color: c }) },
    {
      icône: PaintBucket,
      titre: fr.slides.toolbar.fillColor,
      classe: 'tb-fill-color',
      lire: () => {
        const o = objet();
        return o?.type === 'shape' ? o.fill : null;
      },
      écrire: (c) => scène.modifier((o) => o.type === 'shape' && (o.fill = c)),
    },
    {
      icône: Square,
      titre: fr.slides.toolbar.strokeColor,
      classe: 'tb-stroke-color',
      lire: () => {
        const o = objet();
        return o?.type === 'shape' ? o.stroke : null;
      },
      écrire: (c) => scène.modifier((o) => o.type === 'shape' && ((o.stroke = c), (o.strokeWidth = o.strokeWidth || 2))),
    },
    {
      icône: Layers,
      titre: fr.slides.toolbar.background,
      classe: 'tb-background',
      lire: () => diapo().background,
      écrire: (c) => {
        diapo().background = c ?? '#ffffff';
        scène.dessiner();
        valider();
      },
    },
  ];
  for (const c of couleurs) {
    const b = créerBoutonCouleur({ icône: c.icône, titre: c.titre, classe: c.classe, aucune: fr.slides.toolbar.noColor, autre: fr.slides.toolbar.otherColor, courante: c.lire, appliquer: c.écrire });
    àActualiser.push(() => {
      b.refresh();
      if (c.classe === 'tb-text-color') b.element.disabled = !avecTexte();
      if (c.classe === 'tb-fill-color' || c.classe === 'tb-stroke-color') b.element.disabled = !avecFormeSeulement();
    });
    g5.append(b.element);
  }

  const g6 = groupe();
  bouton(g6, 'slides:bring-front', BringToFront, fr.slides.toolbar.bringFront, undefined, () => !!objet());
  bouton(g6, 'slides:send-back', SendToBack, fr.slides.toolbar.sendBack, undefined, () => !!objet());
  bouton(g6, 'slides:duplicate-object', Copy, fr.slides.toolbar.duplicateObject, undefined, () => !!objet());
  bouton(g6, 'slides:delete-object', Trash2, fr.slides.toolbar.deleteObject, undefined, () => !!objet());
  const g7 = groupe();
  bouton(g7, 'slides:present', Play, fr.slides.toolbar.present);

  function actualiserOutils(): void {
    for (const f of àActualiser) f();
    statut.textContent = fr.slides.status(courante + 1, doc.slides.length, diapo().objects.length);
  }

  // ----- Mode présentation
  function présenter(départ = courante): void {
    let i = départ;
    const surcouche = el('div', 'present');
    surcouche.tabIndex = -1;
    surcouche.setAttribute('role', 'dialog');
    surcouche.setAttribute('aria-label', fr.slides.present.label);
    const zone = el('div', 'present-stage');
    const compteur = el('div', 'present-count');
    const aide = el('div', 'present-hint', fr.slides.present.hint);
    surcouche.append(zone, compteur, aide);
    let plein = false;
    const afficher = () => {
      const échelle = Math.min(window.innerWidth / SLIDE_W, window.innerHeight / SLIDE_H);
      const rendu = rendreDiapo(doc.slides[i]);
      rendu.style.transform = `scale(${échelle})`;
      zone.style.width = `${SLIDE_W * échelle}px`;
      zone.style.height = `${SLIDE_H * échelle}px`;
      zone.replaceChildren(rendu);
      compteur.textContent = fr.slides.present.position(i + 1, doc.slides.length);
    };
    const quitter = () => {
      window.removeEventListener('resize', afficher);
      document.removeEventListener('fullscreenchange', surChangementDePleinÉcran);
      surcouche.remove();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      scène.element.focus();
    };
    const suivante = () => (i < doc.slides.length - 1 ? (i++, afficher()) : quitter());
    const précédente = () => {
      if (i > 0) {
        i--;
        afficher();
      }
    };
    // On ne sait qu'on est en plein écran qu'en voyant NOTRE élément le devenir : un événement de sortie venu
    // d'une présentation précédente, juste quittée, ne doit pas fermer celle-ci.
    function surChangementDePleinÉcran(): void {
      if (document.fullscreenElement === surcouche) {
        plein = true;
        return;
      }
      if (!plein) return;
      // Le navigateur enchaîne parfois une sortie et une entrée : on confirme l'état une fois qu'il s'est stabilisé.
      setTimeout(() => {
        if (surcouche.isConnected && document.fullscreenElement !== surcouche) quitter();
      }, 150);
    }
    surcouche.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) suivante();
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) précédente();
      else if (e.key === 'Home') {
        i = 0;
        afficher();
      } else if (e.key === 'End') {
        i = doc.slides.length - 1;
        afficher();
      } else if (e.key === 'Escape') quitter();
      else return;
      e.preventDefault();
    });
    surcouche.addEventListener('click', suivante);
    window.addEventListener('resize', afficher);
    document.addEventListener('fullscreenchange', surChangementDePleinÉcran);
    document.body.append(surcouche);
    afficher();
    surcouche.focus();
    surcouche.requestFullscreen?.().catch(() => undefined);
  }

  // ----- Actions
  async function insérerImage(): Promise<void> {
    const adresse = await choisirImage(notify);
    if (!adresse) return;
    const { w, h } = await tailleNaturelle(adresse);
    const réduction = Math.min(1, 560 / w, 380 / h);
    const largeur = Math.round(w * réduction);
    const hauteur = Math.round(h * réduction);
    scène.ajouter({ id: cloner(zoneDeTexte(0, 0, 1, 1, '')).id, type: 'image', x: Math.round((SLIDE_W - largeur) / 2), y: Math.round((SLIDE_H - hauteur) / 2), w: largeur, h: hauteur, src: adresse, alt: '' });
  }

  async function gérerMenu(action: MenuAction): Promise<void> {
    switch (action) {
      case 'file:save':
        await contrôleur.save();
        break;
      case 'file:save-as':
        await contrôleur.saveAs();
        break;
      case 'file:export-pptx':
        await contrôleur.exportAs('pptx');
        break;
      case 'file:export-pdf': {
        // Chaque diapositive devient une page : le conteneur n'existe à l'écran que pour l'impression.
        impression.replaceChildren(
          ...doc.slides.map((d) => {
            const page = el('div', 'print-slide');
            page.append(rendreDiapo(d));
            return page;
          }),
        );
        await Promise.all([...impression.querySelectorAll('img')].map((image) => image.decode().catch(() => undefined)));
        await contrôleur.exportPdf();
        impression.replaceChildren();
        break;
      }
      case 'app:save-and-close':
        if (await contrôleur.save()) bridge.closeWindow();
        break;
      case 'edit:undo':
        scène.terminerSaisie();
        restaurer(historique.undo());
        break;
      case 'edit:redo':
        restaurer(historique.redo());
        break;
      case 'format:bold':
        styliser({ bold: !style()?.bold });
        break;
      case 'format:italic':
        styliser({ italic: !style()?.italic });
        break;
      case 'format:underline':
        styliser({ underline: !style()?.underline });
        break;
      case 'format:align-left':
        styliser({ align: 'left' });
        break;
      case 'format:align-center':
        styliser({ align: 'center' });
        break;
      case 'format:align-right':
        styliser({ align: 'right' });
        break;
      case 'slides:new-slide':
        doc.slides.splice(courante + 1, 0, nouvelleDiapo(miseEnPage.value as Layout));
        courante++;
        rafraîchir();
        valider();
        break;
      case 'slides:duplicate-slide':
        doc.slides.splice(courante + 1, 0, cloner(diapo()));
        courante++;
        rafraîchir();
        valider();
        break;
      case 'slides:delete-slide':
        if (doc.slides.length === 1) doc.slides = [nouvelleDiapo('blank')];
        else doc.slides.splice(courante, 1);
        rafraîchir();
        valider();
        break;
      case 'slides:move-up':
      case 'slides:move-down': {
        const vers = action === 'slides:move-up' ? courante - 1 : courante + 1;
        if (vers < 0 || vers >= doc.slides.length) break;
        [doc.slides[courante], doc.slides[vers]] = [doc.slides[vers], doc.slides[courante]];
        courante = vers;
        rafraîchir();
        valider();
        break;
      }
      case 'slides:insert-text':
        scène.ajouter(zoneDeTexte(300, 220, 360, 80, 'Texte', { size: 32 }));
        break;
      case 'slides:insert-rect':
        scène.ajouter(forme('rect', 380, 200, 200, 140));
        break;
      case 'slides:insert-ellipse':
        scène.ajouter(forme('ellipse', 380, 200, 200, 140));
        break;
      case 'slides:insert-image':
        await insérerImage();
        break;
      case 'slides:bring-front':
        scène.ordonner(true);
        break;
      case 'slides:send-back':
        scène.ordonner(false);
        break;
      case 'slides:duplicate-object':
        scène.dupliquer();
        break;
      case 'slides:delete-object':
        scène.supprimer();
        break;
      case 'slides:present':
        présenter();
        break;
    }
  }

  // Raccourcis clavier : les menus natifs ne les enregistrent pas (ils s'afficheraient deux fois).
  racine.addEventListener('keydown', (e) => {
    const cible = e.target as HTMLElement;
    if (cible.closest('input, select, [contenteditable="plaintext-only"]')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const touche = e.key.toLowerCase();
    const faire = (action: MenuAction) => {
      e.preventDefault();
      void gérerMenu(action);
    };
    if (ctrl && touche === 'z') return faire(e.shiftKey ? 'edit:redo' : 'edit:undo');
    if (ctrl && touche === 'y') return faire('edit:redo');
    if (ctrl && touche === 'd') return faire('slides:duplicate-object');
    if (ctrl && touche === 'b') return faire('format:bold');
    if (ctrl && touche === 'i') return faire('format:italic');
    if (ctrl && touche === 'm') return faire('slides:new-slide');
    if (e.key === 'F5') return faire('slides:present');
    if (e.key === 'PageDown' && !scène.enSaisie) {
      e.preventDefault();
      aller(courante + 1);
    }
    if (e.key === 'PageUp' && !scène.enSaisie) {
      e.preventDefault();
      aller(courante - 1);
    }
  });

  const principal = el('div', 'sl-main');
  principal.append(panneau, scène.element);
  racine.append(barre, principal, barreÉtat);
  hôte.append(racine, impression);
  rafraîchir();
  contrôleur.startAutosave();
  scène.element.focus();

  return {
    controller: contrôleur,
    scène,
    newDocument: () => scène.element.focus(),
    async openFile(fichier: OpenedFile) {
      const ouvert = await contrôleur.open(fichier);
      scène.element.focus();
      return ouvert;
    },
    async openRecovered(_id: string, nom: string, octets: Uint8Array) {
      const ouvert = await contrôleur.openRecovered(nom, octets);
      scène.element.focus();
      return ouvert;
    },
    handleMenu: gérerMenu,
    dispose: () => contrôleur.dispose(),
  };
}
