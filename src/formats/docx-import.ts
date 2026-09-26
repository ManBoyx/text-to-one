import type { JSONContent } from '@tiptap/core';
import { strFromU8, unzipSync } from 'fflate';
import { FormatError } from './errors';
import { bytesToDataUrl, mimeForExt } from './images';
import { formuleValide } from '../shared/math';
import { ommlEnLatex, ommlEnTexte } from './omml';

type Noeud = JSONContent;
type Marque = NonNullable<Noeud['marks']>[number];
type EnLigne = Noeud | { type: '__saut' };
type Élément = { kind: 'bloc'; noeuds: Noeud[] } | { kind: 'liste'; noeud: Noeud; numId: string; niveau: number };

export interface ImportResult {
  doc: Noeud;
  warnings: string[];
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const EMU_PAR_PIXEL = 9525;
const TAILLE_MAX_FICHIER = 200 * 1024 * 1024;
const INVALIDE = "Ce fichier n'est pas un document Word valide.";
const ENDOMMAGÉ = 'Ce document Word est endommagé : son contenu est illisible.';
const SURLIGNAGES: Record<string, string> = {
  yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF', blue: '#0000FF', red: '#FF0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#C0C0C0', black: '#000000', white: '#FFFFFF',
};
const IMAGES_LISIBLES = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp'];

interface Contexte {
  fichiers: Record<string, Uint8Array>;
  relations: Map<string, { cible: string; externe: boolean }>;
  styles: Map<string, { nom: string; baséSur?: string; numPr?: { numId: string; niveau: number } }>;
  défauts: { taille?: number; police?: string };
  typeDeListe: (numId: string, niveau: number) => 'puces' | 'numérotée';
  imagesIgnorées: number;
  zonesDeTexte: boolean;
}

// ---------- Petits outils XML ----------

const enfants = (el: Element | undefined | null, nom?: string): Element[] =>
  el ? Array.from(el.children).filter((c) => !nom || c.localName === nom) : [];
const premier = (el: Element | undefined | null, nom: string): Element | undefined => enfants(el, nom)[0];
const attrW = (el: Element | undefined | null, nom: string): string | null =>
  el ? (el.getAttributeNS(W, nom) ?? el.getAttribute(`w:${nom}`)) : null;
const attrR = (el: Element, nom: string): string | null => el.getAttributeNS(R, nom) ?? el.getAttribute(`r:${nom}`);

function lireXml(fichiers: Record<string, Uint8Array>, chemin: string): Document | null {
  const brut = fichiers[chemin];
  if (!brut) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(strFromU8(brut), 'application/xml');
  } catch {
    throw new FormatError(ENDOMMAGÉ);
  }
  if (doc.getElementsByTagName('parsererror').length > 0) throw new FormatError(ENDOMMAGÉ);
  return doc;
}

/** Une propriété « à bascule » de Word : présente et pas explicitement désactivée. */
function activé(rPr: Element, nom: string): boolean {
  const el = premier(rPr, nom);
  if (!el) return false;
  const valeur = attrW(el, 'val');
  return valeur === null || !['0', 'false', 'off', 'none'].includes(valeur);
}

// ---------- Lecture des parties du fichier ----------

function lireRelations(doc: Document | null): Contexte['relations'] {
  const relations: Contexte['relations'] = new Map();
  for (const rel of enfants(doc?.documentElement, 'Relationship')) {
    relations.set(rel.getAttribute('Id') ?? '', { cible: rel.getAttribute('Target') ?? '', externe: rel.getAttribute('TargetMode') === 'External' });
  }
  return relations;
}

function lireStyles(doc: Document | null): Pick<Contexte, 'styles' | 'défauts'> {
  const styles: Contexte['styles'] = new Map();
  const défauts: Contexte['défauts'] = {};
  if (!doc) return { styles, défauts };
  const racine = doc.documentElement;
  const appliquer = (rPr: Element | undefined) => {
    const taille = Number(attrW(premier(rPr, 'sz'), 'val'));
    if (taille > 0) défauts.taille = taille;
    const police = attrW(premier(rPr, 'rFonts'), 'ascii');
    if (police) défauts.police = police;
  };
  appliquer(premier(premier(premier(racine, 'docDefaults'), 'rPrDefault'), 'rPr'));
  for (const style of enfants(racine, 'style')) {
    const id = attrW(style, 'styleId');
    if (!id) continue;
    const numérotation = premier(premier(style, 'pPr'), 'numPr');
    const numIdDuStyle = attrW(premier(numérotation, 'numId'), 'val');
    styles.set(id, {
      nom: (attrW(premier(style, 'name'), 'val') ?? '').toLowerCase(),
      baséSur: attrW(premier(style, 'basedOn'), 'val') ?? undefined,
      numPr: numIdDuStyle ? { numId: numIdDuStyle, niveau: Number(attrW(premier(numérotation, 'ilvl'), 'val')) || 0 } : undefined,
    });
    if (attrW(style, 'default') === '1' && attrW(style, 'type') === 'paragraph') appliquer(premier(style, 'rPr'));
  }
  return { styles, défauts };
}

function lireNumérotation(doc: Document | null): Contexte['typeDeListe'] {
  const formats = new Map<string, Map<number, string>>();
  const abstraite = new Map<string, string>();
  for (const a of enfants(doc?.documentElement, 'abstractNum')) {
    const niveaux = new Map<number, string>();
    for (const l of enfants(a, 'lvl')) niveaux.set(Number(attrW(l, 'ilvl')), attrW(premier(l, 'numFmt'), 'val') ?? 'decimal');
    formats.set(attrW(a, 'abstractNumId') ?? '', niveaux);
  }
  for (const n of enfants(doc?.documentElement, 'num')) abstraite.set(attrW(n, 'numId') ?? '', attrW(premier(n, 'abstractNumId'), 'val') ?? '');
  return (numId, niveau) => {
    const format = formats.get(abstraite.get(numId) ?? '')?.get(niveau);
    return format === undefined || format === 'bullet' || format === 'none' ? 'puces' : 'numérotée';
  };
}

/** Un titre se reconnaît au nom de son style (« heading 1 »), y compris à travers les styles dérivés. */
function niveauDeTitre(styleId: string | null, styles: Contexte['styles']): number | null {
  let id = styleId;
  for (let profondeur = 0; id && profondeur < 6; profondeur++) {
    const style = styles.get(id);
    const nom = style?.nom || id.toLowerCase();
    const trouvé = /^(?:heading|titre) ?([1-6])$/.exec(nom);
    if (trouvé) return Number(trouvé[1]);
    if (nom === 'title' || nom === 'titre') return 1;
    id = style?.baséSur ?? null;
  }
  return null;
}

/** Les listes faites avec les styles « Liste à puces » ou « Liste numérotée » de Word portent leur numérotation dans le style. */
function numérotationDuStyle(styleId: string | null, styles: Contexte['styles']): { numId: string; niveau: number } | null {
  let id = styleId;
  for (let profondeur = 0; id && profondeur < 6; profondeur++) {
    const style = styles.get(id);
    if (style?.numPr) return style.numPr;
    id = style?.baséSur ?? null;
  }
  return null;
}

// ---------- Texte ----------

function lireMarques(rPr: Element | undefined, ctx: Contexte): Marque[] {
  const marques: Marque[] = [];
  if (!rPr) return marques;
  const style = attrW(premier(rPr, 'rStyle'), 'val')?.toLowerCase();
  if (activé(rPr, 'b') || style === 'strong') marques.push({ type: 'bold' });
  if (activé(rPr, 'i') || style === 'emphasis') marques.push({ type: 'italic' });
  if (activé(rPr, 'u')) marques.push({ type: 'underline' });
  if (activé(rPr, 'strike') || activé(rPr, 'dstrike')) marques.push({ type: 'strike' });
  const alignement = attrW(premier(rPr, 'vertAlign'), 'val');
  if (alignement === 'superscript') marques.push({ type: 'superscript' });
  if (alignement === 'subscript') marques.push({ type: 'subscript' });
  const remplissage = attrW(premier(rPr, 'shd'), 'fill');
  const surlignage = SURLIGNAGES[attrW(premier(rPr, 'highlight'), 'val') ?? ''] ?? (/^[0-9a-f]{6}$/i.test(remplissage ?? '') ? `#${remplissage!.toUpperCase()}` : undefined);
  if (surlignage) marques.push({ type: 'highlight', attrs: { color: surlignage } });
  const attrs: Record<string, string> = {};
  const couleur = attrW(premier(rPr, 'color'), 'val');
  if (couleur && /^[0-9a-f]{6}$/i.test(couleur)) attrs.color = `#${couleur.toUpperCase()}`;
  const police = attrW(premier(rPr, 'rFonts'), 'ascii');
  if (police && police !== ctx.défauts.police) attrs.fontFamily = police;
  const taille = Number(attrW(premier(rPr, 'sz'), 'val'));
  if (taille > 0 && taille !== ctx.défauts.taille) attrs.fontSize = `${taille / 2}pt`;
  if (Object.keys(attrs).length) marques.push({ type: 'textStyle', attrs });
  return marques;
}

function fusionnerMarques(a: Marque[], b: Marque[]): Marque[] {
  const vus = new Set<string>();
  return [...a, ...b].filter((m) => !vus.has(m.type) && vus.add(m.type));
}

const adresseSûre = (href: string | undefined): href is string => !!href && /^(https?:|mailto:|tel:)/i.test(href);

function résoudreChemin(cible: string): string {
  return new URL(cible, 'http://document/word/').pathname.slice(1);
}

function lireDessin(dessin: Element, ctx: Contexte): Noeud | null {
  const image = dessin.getElementsByTagNameNS('*', 'blip')[0];
  if (!image) {
    if (dessin.getElementsByTagNameNS('*', 'txbxContent').length > 0) ctx.zonesDeTexte = true;
    return null;
  }
  const identifiant = attrR(image, 'embed');
  const relation = identifiant ? ctx.relations.get(identifiant) : undefined;
  const chemin = relation && !relation.externe ? résoudreChemin(relation.cible) : '';
  const données = ctx.fichiers[chemin];
  const mime = mimeForExt(chemin.split('.').pop() ?? '');
  if (!données || !mime || !IMAGES_LISIBLES.includes(mime)) {
    ctx.imagesIgnorées++;
    return null;
  }
  const dimension = dessin.getElementsByTagNameNS('*', 'extent')[0];
  const largeur = Math.round(Number(dimension?.getAttribute('cx')) / EMU_PAR_PIXEL) || undefined;
  const hauteur = Math.round(Number(dimension?.getAttribute('cy')) / EMU_PAR_PIXEL) || undefined;
  const description = dessin.getElementsByTagNameNS('*', 'docPr')[0]?.getAttribute('descr') ?? '';
  return {
    type: 'image',
    attrs: { src: bytesToDataUrl(données, mime), alt: description, ...(largeur ? { width: largeur } : {}), ...(hauteur ? { height: hauteur } : {}) },
  };
}

function lireExécution(course: Element, ctx: Contexte, héritées: Marque[]): EnLigne[] {
  const marques = fusionnerMarques(héritées, lireMarques(premier(course, 'rPr'), ctx));
  const sortie: EnLigne[] = [];
  const texte = (t: string) => {
    if (t) sortie.push({ type: 'text', text: t, ...(marques.length ? { marks: marques } : {}) });
  };
  for (const c of enfants(course)) {
    switch (c.localName) {
      case 't':
        texte(c.textContent ?? '');
        break;
      case 'tab':
        texte('\t');
        break;
      case 'noBreakHyphen':
        texte('‑');
        break;
      case 'br':
        sortie.push(attrW(c, 'type') === 'page' ? { type: '__saut' } : { type: 'hardBreak' });
        break;
      case 'drawing':
      case 'AlternateContent': {
        const dessin = c.localName === 'drawing' ? c : c.getElementsByTagNameNS('*', 'drawing')[0];
        const image = dessin ? lireDessin(dessin, ctx) : null;
        if (image) sortie.push(image);
        break;
      }
    }
  }
  return sortie;
}

/** Une formule Word en nœud de formule ; si KaTeX ne la comprend pas, son texte brut, pour ne rien perdre. */
function formuleImportée(formule: Element, bloc: boolean): EnLigne[] {
  const latex = ommlEnLatex(formule);
  if (latex && formuleValide(latex)) return [{ type: bloc ? 'mathBlock' : 'mathInline', attrs: { latex } }];
  const texte = ommlEnTexte(formule);
  return texte ? [{ type: 'text', text: texte }] : [];
}

function lireEnLigne(parent: Element, ctx: Contexte, héritées: Marque[]): EnLigne[] {
  const sortie: EnLigne[] = [];
  for (const c of enfants(parent)) {
    switch (c.localName) {
      case 'r':
        sortie.push(...lireExécution(c, ctx, héritées));
        break;
      case 'hyperlink': {
        const identifiant = attrR(c, 'id');
        const relation = identifiant ? ctx.relations.get(identifiant) : undefined;
        const href = relation?.externe ? relation.cible : undefined;
        const lien: Marque[] = adresseSûre(href) ? [{ type: 'link', attrs: { href } }] : [];
        sortie.push(...lireEnLigne(c, ctx, [...héritées, ...lien]));
        break;
      }
      case 'oMath':
        sortie.push(...formuleImportée(c, false));
        break;
      // Une formule seule sur sa ligne : Word l'entoure d'un « oMathPara ».
      case 'oMathPara':
        for (const formule of enfants(c, 'oMath')) sortie.push(...formuleImportée(formule, true));
        break;
      // Le suivi des modifications : on garde le texte inséré, on ignore le texte supprimé (« del »).
      case 'ins':
      case 'smartTag':
      case 'sdt':
      case 'sdtContent':
      case 'fldSimple':
      case 'customXml':
        sortie.push(...lireEnLigne(c, ctx, héritées));
        break;
    }
  }
  return sortie;
}

function fusionnerTextes(noeuds: Noeud[]): Noeud[] {
  const sortie: Noeud[] = [];
  for (const n of noeuds) {
    const précédent = sortie[sortie.length - 1];
    if (n.type === 'text' && précédent?.type === 'text' && JSON.stringify(précédent.marks ?? []) === JSON.stringify(n.marks ?? [])) {
      précédent.text = (précédent.text ?? '') + (n.text ?? '');
    } else {
      sortie.push({ ...n });
    }
  }
  return sortie;
}

// ---------- Blocs ----------

function lireParagraphe(p: Element, ctx: Contexte): Élément {
  const pPr = premier(p, 'pPr');
  const niveauTitre = niveauDeTitre(attrW(premier(pPr, 'pStyle'), 'val'), ctx.styles);
  const attrs: Record<string, unknown> = {};
  const jc = attrW(premier(pPr, 'jc'), 'val');
  const alignement = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' || jc === 'distribute' ? 'justify' : null;
  if (alignement) attrs.textAlign = alignement;
  const espacement = premier(pPr, 'spacing');
  const ligne = Number(attrW(espacement, 'line'));
  const règle = attrW(espacement, 'lineRule');
  if (ligne > 0 && (règle === null || règle === 'auto')) {
    const rapport = Math.round((ligne / 240) * 100) / 100;
    if (Math.abs(rapport - 1) > 0.01) attrs.lineHeight = String(rapport);
  }

  const fabriquer = (contenu: Noeud[]): Noeud => {
    const noeud: Noeud = niveauTitre ? { type: 'heading', attrs: { level: niveauTitre, ...attrs } } : { type: 'paragraph' };
    if (!niveauTitre && Object.keys(attrs).length) noeud.attrs = { ...attrs };
    if (contenu.length) noeud.content = contenu;
    return noeud;
  };

  const noeuds: Noeud[] = [];
  if (premier(pPr, 'pageBreakBefore')) noeuds.push({ type: 'pageBreak' });
  let courant: Noeud[] = [];
  let coupé = false;
  for (const élément of lireEnLigne(p, ctx, [])) {
    if (élément.type === '__saut' || élément.type === 'mathBlock') {
      coupé = true;
      if (courant.length) noeuds.push(fabriquer(fusionnerTextes(courant)));
      courant = [];
      noeuds.push(élément.type === 'mathBlock' ? élément : { type: 'pageBreak' });
    } else {
      courant.push(élément);
    }
  }
  if (courant.length || !coupé) noeuds.push(fabriquer(fusionnerTextes(courant)));

  // La numérotation écrite dans le paragraphe l'emporte (« 0 » veut dire : pas de liste) ; sinon celle de son style.
  const numPr = premier(pPr, 'numPr');
  const directe = attrW(premier(numPr, 'numId'), 'val');
  const héritée = directe === null ? numérotationDuStyle(attrW(premier(pPr, 'pStyle'), 'val'), ctx.styles) : null;
  const numId = directe ?? héritée?.numId ?? null;
  const niveau = directe !== null ? Number(attrW(premier(numPr, 'ilvl'), 'val')) || 0 : (héritée?.niveau ?? 0);
  if (numId && numId !== '0' && !niveauTitre && noeuds.length === 1 && noeuds[0].type === 'paragraph') {
    return { kind: 'liste', noeud: noeuds[0], numId, niveau };
  }
  return { kind: 'bloc', noeuds };
}

function lireTableau(tbl: Element, ctx: Contexte): Noeud {
  const lignes: Noeud[] = [];
  const ouvertes = new Map<number, Noeud>(); // colonne → cellule qui se prolonge vers le bas
  enfants(tbl, 'tr').forEach((tr, indice) => {
    const propriétésLigne = premier(tr, 'trPr');
    const enTête = indice === 0 && !!propriétésLigne && activé(propriétésLigne, 'tblHeader');
    const cellules: Noeud[] = [];
    let colonne = 0;
    for (const tc of enfants(tr, 'tc')) {
      const propriétés = premier(tc, 'tcPr');
      const étendue = Number(attrW(premier(propriétés, 'gridSpan'), 'val')) || 1;
      const fusion = premier(propriétés, 'vMerge');
      const valeurFusion = fusion ? (attrW(fusion, 'val') ?? 'continue') : null;
      if (valeurFusion === 'continue') {
        const propriétaire = ouvertes.get(colonne);
        if (propriétaire?.attrs) propriétaire.attrs.rowspan = Number(propriétaire.attrs.rowspan) + 1;
        colonne += étendue;
        continue;
      }
      const contenu = lireBlocs(tc, ctx);
      const cellule: Noeud = {
        type: enTête ? 'tableHeader' : 'tableCell',
        attrs: { colspan: étendue, rowspan: 1 },
        content: contenu.length ? contenu : [{ type: 'paragraph' }],
      };
      for (let i = 0; i < étendue; i++) {
        if (valeurFusion === 'restart') ouvertes.set(colonne + i, cellule);
        else ouvertes.delete(colonne + i);
      }
      cellules.push(cellule);
      colonne += étendue;
    }
    if (cellules.length) lignes.push({ type: 'tableRow', content: cellules });
  });
  return { type: 'table', content: lignes };
}

/** Regroupe les paragraphes numérotés qui se suivent en listes, avec leurs sous-listes. */
function assembler(éléments: Élément[], ctx: Contexte): Noeud[] {
  interface Niveau { niveau: number; numId: string; type: 'puces' | 'numérotée'; liste: Noeud; conteneur: Noeud[]; dernier?: Noeud }
  const sortie: Noeud[] = [];
  let pile: Niveau[] = [];
  for (const élément of éléments) {
    if (élément.kind === 'bloc') {
      pile = [];
      sortie.push(...élément.noeuds);
      continue;
    }
    const type = ctx.typeDeListe(élément.numId, élément.niveau);
    while (pile.length && pile[pile.length - 1].niveau > élément.niveau) pile.pop();
    let haut = pile[pile.length - 1];
    const nouvelleListe = (conteneur: Noeud[]): Niveau => {
      const liste: Noeud = { type: type === 'puces' ? 'bulletList' : 'orderedList', content: [] };
      conteneur.push(liste);
      const niveau: Niveau = { niveau: élément.niveau, numId: élément.numId, type, liste, conteneur };
      pile.push(niveau);
      return niveau;
    };
    if (!haut || haut.niveau < élément.niveau) {
      haut = nouvelleListe(haut?.dernier?.content ?? sortie);
    } else if (haut.type !== type || haut.numId !== élément.numId) {
      pile.pop();
      haut = nouvelleListe(haut.conteneur);
    }
    const item: Noeud = { type: 'listItem', content: [élément.noeud] };
    haut.liste.content?.push(item);
    haut.dernier = item;
  }
  return sortie;
}

function lireBlocs(conteneur: Element, ctx: Contexte): Noeud[] {
  const éléments: Élément[] = [];
  const parcourir = (parent: Element) => {
    for (const c of enfants(parent)) {
      switch (c.localName) {
        case 'p':
          éléments.push(lireParagraphe(c, ctx));
          break;
        case 'tbl': {
          const table = lireTableau(c, ctx);
          if (table.content?.length) éléments.push({ kind: 'bloc', noeuds: [table] });
          break;
        }
        case 'sdt':
          parcourir(premier(c, 'sdtContent') ?? c);
          break;
        case 'customXml':
        case 'ins':
          parcourir(c);
          break;
      }
    }
  };
  parcourir(conteneur);
  return assembler(éléments, ctx);
}

// ---------- Point d'entrée ----------

function avertissements(ctx: Contexte): string[] {
  const liste: string[] = [];
  const avecTexte = (nom: string) => /<w:t(?:\s[^>]*)?>[^<]*\S[^<]*<\/w:t>/.test(strFromU8(ctx.fichiers[nom]));
  if (Object.keys(ctx.fichiers).some((nom) => /^word\/(header|footer)\d*\.xml$/.test(nom) && avecTexte(nom))) {
    liste.push('Les en-têtes et pieds de page du document ne sont pas repris.');
  }
  const notes = ctx.fichiers['word/footnotes.xml'];
  if (notes && /<w:footnote\b(?![^>]*\bw:type=)[^>]*>[\s\S]*?<w:t[\s>]/.test(strFromU8(notes))) {
    liste.push('Les notes de bas de page ne sont pas reprises.');
  }
  if (ctx.zonesDeTexte) liste.push('Les zones de texte ne sont pas reprises.');
  if (ctx.imagesIgnorées === 1) liste.push("1 image n'a pas pu être reprise (format non pris en charge).");
  if (ctx.imagesIgnorées > 1) liste.push(`${ctx.imagesIgnorées} images n'ont pas pu être reprises (format non pris en charge).`);
  return liste;
}

/** Lit un fichier .docx ; lève une FormatError au message clair s'il est invalide ou endommagé. */
export function importDocx(bytes: Uint8Array): ImportResult {
  let fichiers: Record<string, Uint8Array>;
  try {
    fichiers = unzipSync(bytes, { filter: (fichier) => fichier.originalSize <= TAILLE_MAX_FICHIER });
  } catch {
    throw new FormatError(INVALIDE);
  }
  if (!fichiers['word/document.xml']) throw new FormatError(`${INVALIDE} (contenu principal introuvable)`);

  const corps = premier(lireXml(fichiers, 'word/document.xml')?.documentElement, 'body');
  if (!corps) throw new FormatError(ENDOMMAGÉ);
  const { styles, défauts } = lireStyles(lireXml(fichiers, 'word/styles.xml'));
  const ctx: Contexte = {
    fichiers,
    relations: lireRelations(lireXml(fichiers, 'word/_rels/document.xml.rels')),
    styles,
    défauts,
    typeDeListe: lireNumérotation(lireXml(fichiers, 'word/numbering.xml')),
    imagesIgnorées: 0,
    zonesDeTexte: false,
  };
  const contenu = lireBlocs(corps, ctx);
  return { doc: { type: 'doc', content: contenu.length ? contenu : [{ type: 'paragraph' }] }, warnings: avertissements(ctx) };
}
