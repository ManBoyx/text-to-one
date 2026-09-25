import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { FormatError } from '../errors';
import { SheetEngine } from './engine';
import { enToFrFormula, frToEnFormula, shiftReferences } from './formula';
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MAX_COLS,
  MAX_ROWS,
  address,
  emptySheet,
  parseAddress,
  type Alignment,
  type CellStyle,
  type NumberFormat,
  type SheetDoc,
} from './model';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const INVALIDE = "Ce fichier n'est pas un classeur Excel valide.";
const ENDOMMAGÉ = 'Ce classeur Excel est endommagé : son contenu est illisible.';
const TAILLE_MAX_FICHIER = 200 * 1024 * 1024;
const PIXELS_PAR_CARACTÈRE = 7;
const FORMAT_EURO = '#,##0.00\\ "€"';
const ENTÊTE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const échapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (couleur: string): string => couleur.slice(1).toUpperCase();
const FORMAT_VERS_ID: Record<NumberFormat, number> = { general: 0, int: 3, dec2: 4, percent: 10, eur: 164 };

// ---------- Export ----------

/** Fabrique la table des styles d'Excel : chaque combinaison de style devient une entrée numérotée. */
class Styles {
  private polices = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  private remplissages = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private formats = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private connus = new Map<string, number>();

  index(style: CellStyle | undefined): number {
    if (!style || !Object.keys(style).length) return 0;
    const clé = JSON.stringify([style.b, style.i, style.a, style.c, style.f, style.n]);
    const déjà = this.connus.get(clé);
    if (déjà !== undefined) return déjà;
    let police = 0;
    if (style.b || style.i || style.c) {
      this.polices.push(`<font>${style.b ? '<b/>' : ''}${style.i ? '<i/>' : ''}<sz val="11"/>${style.c ? `<color rgb="FF${hex(style.c)}"/>` : ''}<name val="Calibri"/></font>`);
      police = this.polices.length - 1;
    }
    let remplissage = 0;
    if (style.f) {
      this.remplissages.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${hex(style.f)}"/><bgColor indexed="64"/></patternFill></fill>`);
      remplissage = this.remplissages.length - 1;
    }
    const alignement = style.a ? `<alignment horizontal="${style.a}"/>` : '';
    this.formats.push(
      `<xf numFmtId="${FORMAT_VERS_ID[style.n ?? 'general']}" fontId="${police}" fillId="${remplissage}" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1">${alignement}</xf>`,
    );
    this.connus.set(clé, this.formats.length - 1);
    return this.formats.length - 1;
  }

  xml(): string {
    return (
      `${ENTÊTE}<styleSheet xmlns="${NS}">` +
      `<numFmts count="1"><numFmt numFmtId="164" formatCode="${échapper(FORMAT_EURO)}"/></numFmts>` +
      `<fonts count="${this.polices.length}">${this.polices.join('')}</fonts>` +
      `<fills count="${this.remplissages.length}">${this.remplissages.join('')}</fills>` +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.formats.length}">${this.formats.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    );
  }
}

/** Écrit un classeur Excel : formules en anglais avec leur résultat en mémoire, styles, largeurs de colonnes. */
export function exportXlsx(doc: SheetDoc): Uint8Array {
  const moteur = new SheetEngine(doc);
  const styles = new Styles();
  const adresses = new Set([...Object.keys(doc.cells), ...Object.keys(doc.styles)]);
  const lignes = new Map<number, { c: number; xml: string }[]>();

  for (const adresse of adresses) {
    const a = parseAddress(adresse);
    if (!a) continue;
    const brut = moteur.raw(a.r, a.c);
    const s = styles.index(doc.styles[adresse]);
    const attributs = `r="${address(a.r, a.c)}"${s ? ` s="${s}"` : ''}`;
    let xml: string;
    if (brut === '') xml = `<c ${attributs}/>`;
    else {
      const v = moteur.value(a.r, a.c);
      if (brut.startsWith('=')) {
        const formule = `<f>${échapper(frToEnFormula(brut).slice(1))}</f>`;
        if (typeof v === 'number') xml = `<c ${attributs}>${formule}<v>${v}</v></c>`;
        else if (typeof v === 'boolean') xml = `<c ${attributs} t="b">${formule}<v>${v ? 1 : 0}</v></c>`;
        else if (v !== null && typeof v === 'object') xml = `<c ${attributs} t="e">${formule}<v>${échapper(v.error)}</v></c>`;
        else xml = `<c ${attributs} t="str">${formule}<v>${échapper(String(v ?? ''))}</v></c>`;
      } else if (typeof v === 'number') xml = `<c ${attributs}><v>${v}</v></c>`;
      else xml = `<c ${attributs} t="inlineStr"><is><t xml:space="preserve">${échapper(brut)}</t></is></c>`;
    }
    if (!lignes.has(a.r)) lignes.set(a.r, []);
    lignes.get(a.r)!.push({ c: a.c, xml });
  }

  const données = [...lignes.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([r, cellules]) => `<row r="${r + 1}">${cellules.sort((x, y) => x.c - y.c).map((c) => c.xml).join('')}</row>`)
    .join('');
  const colonnes = Object.entries(doc.colWidths)
    .sort((x, y) => Number(x[0]) - Number(y[0]))
    .map(([c, px]) => `<col min="${Number(c) + 1}" max="${Number(c) + 1}" width="${(px - 5) / PIXELS_PAR_CARACTÈRE}" customWidth="1"/>`)
    .join('');

  const fichiers: Record<string, string> = {
    '[Content_Types].xml':
      `${ENTÊTE}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':
      `${ENTÊTE}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':
      `${ENTÊTE}<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets><sheet name="Feuille 1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      `${ENTÊTE}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${NS_R}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': styles.xml(),
    'xl/worksheets/sheet1.xml': `${ENTÊTE}<worksheet xmlns="${NS}">${colonnes ? `<cols>${colonnes}</cols>` : ''}<sheetData>${données}</sheetData></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(fichiers).map(([nom, contenu]) => [nom, strToU8(contenu)])), { level: 6 });
}

// ---------- Import ----------

const enfants = (el: Element | null | undefined, nom?: string): Element[] => (el ? Array.from(el.children).filter((c) => !nom || c.localName === nom) : []);
const premier = (el: Element | null | undefined, nom: string): Element | undefined => enfants(el, nom)[0];
const attrR = (el: Element, nom: string): string | null => el.getAttributeNS(NS_R, nom) ?? el.getAttribute(`r:${nom}`);

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

const cheminDansLeClasseur = (cible: string): string => (cible.startsWith('/') ? cible.slice(1) : `xl/${cible}`.replace(/xl\/\.\.\//, ''));

function lireChaînes(doc: Document | null): string[] {
  return enfants(doc?.documentElement, 'si').map((si) => Array.from(si.getElementsByTagNameNS('*', 't')).map((t) => t.textContent ?? '').join(''));
}

const aligné = (valeur: string | null): Alignment | undefined => (valeur === 'left' || valeur === 'center' || valeur === 'right' ? valeur : undefined);

function lireStyles(doc: Document | null): (CellStyle | undefined)[] {
  if (!doc) return [];
  const racine = doc.documentElement;
  const formatsPerso = new Map<string, string>();
  for (const f of enfants(premier(racine, 'numFmts'), 'numFmt')) formatsPerso.set(f.getAttribute('numFmtId') ?? '', f.getAttribute('formatCode') ?? '');
  const polices = enfants(premier(racine, 'fonts'), 'font').map((f) => {
    const couleur = premier(f, 'color')?.getAttribute('rgb') ?? '';
    return { b: !!premier(f, 'b'), i: !!premier(f, 'i'), c: /^[0-9A-Fa-f]{8}$/.test(couleur) ? `#${couleur.slice(2).toLowerCase()}` : undefined };
  });
  const remplissages = enfants(premier(racine, 'fills'), 'fill').map((f) => {
    const motif = premier(f, 'patternFill');
    const couleur = premier(motif, 'fgColor')?.getAttribute('rgb') ?? '';
    return motif?.getAttribute('patternType') === 'solid' && /^[0-9A-Fa-f]{8}$/.test(couleur) ? `#${couleur.slice(2).toLowerCase()}` : undefined;
  });
  return enfants(premier(racine, 'cellXfs'), 'xf').map((xf) => {
    const style: CellStyle = {};
    const police = polices[Number(xf.getAttribute('fontId'))];
    if (police?.b) style.b = true;
    if (police?.i) style.i = true;
    if (police?.c) style.c = police.c;
    const fond = remplissages[Number(xf.getAttribute('fillId'))];
    if (fond) style.f = fond;
    const alignement = aligné(premier(xf, 'alignment')?.getAttribute('horizontal') ?? null);
    if (alignement) style.a = alignement;
    const id = xf.getAttribute('numFmtId') ?? '0';
    const code = formatsPerso.get(id) ?? '';
    if (id === '1' || id === '3') style.n = 'int';
    else if (id === '2' || id === '4') style.n = 'dec2';
    else if (id === '9' || id === '10') style.n = 'percent';
    else if (/€|EUR/.test(code)) style.n = 'eur';
    return Object.keys(style).length ? style : undefined;
  });
}

/** Lit un classeur Excel : la première feuille, avec valeurs, formules, styles simples et largeurs de colonnes. */
export function importXlsx(octets: Uint8Array): { doc: SheetDoc; warnings: string[] } {
  let fichiers: Record<string, Uint8Array>;
  try {
    fichiers = unzipSync(octets, { filter: (f) => f.originalSize <= TAILLE_MAX_FICHIER });
  } catch {
    throw new FormatError(INVALIDE);
  }
  const classeur = lireXml(fichiers, 'xl/workbook.xml');
  if (!classeur) throw new FormatError(`${INVALIDE} (contenu principal introuvable)`);

  const feuilles = enfants(premier(classeur.documentElement, 'sheets'), 'sheet');
  const identifiant = feuilles[0] ? attrR(feuilles[0], 'id') : null;
  const relation = enfants(lireXml(fichiers, 'xl/_rels/workbook.xml.rels')?.documentElement, 'Relationship').find((r) => r.getAttribute('Id') === identifiant);
  const chemin = relation ? cheminDansLeClasseur(relation.getAttribute('Target') ?? '') : 'xl/worksheets/sheet1.xml';
  const feuille = lireXml(fichiers, chemin);
  if (!feuille) throw new FormatError(`${INVALIDE} (aucune feuille trouvée)`);

  const chaînes = lireChaînes(lireXml(fichiers, 'xl/sharedStrings.xml'));
  const styles = lireStyles(lireXml(fichiers, 'xl/styles.xml'));
  const doc = emptySheet();
  const warnings: string[] = [];
  const partagées = new Map<string, { formule: string; r: number; c: number }>();
  let dernièreLigne = 0;
  let dernièreColonne = 0;
  let tropGrand = false;

  for (const ligne of enfants(premier(feuille.documentElement, 'sheetData'), 'row')) {
    for (const cellule of enfants(ligne, 'c')) {
      const a = parseAddress(cellule.getAttribute('r') ?? '');
      if (!a) continue;
      if (a.r >= MAX_ROWS || a.c >= MAX_COLS) {
        tropGrand = true;
        continue;
      }
      const type = cellule.getAttribute('t');
      const f = premier(cellule, 'f');
      const v = premier(cellule, 'v')?.textContent ?? '';
      let brut = '';
      if (f) {
        let formule = f.textContent ?? '';
        const si = f.getAttribute('si');
        if (f.getAttribute('t') === 'shared' && si !== null) {
          if (formule) partagées.set(si, { formule: `=${enToFrFormula(formule.replace(/_xlfn\./g, ''))}`, r: a.r, c: a.c });
          const maître = partagées.get(si);
          if (maître) brut = formule ? maître.formule : shiftReferences(maître.formule, a.r - maître.r, a.c - maître.c);
        } else {
          brut = `=${enToFrFormula(formule.replace(/_xlfn\./g, ''))}`;
          formule = '';
        }
      } else if (type === 's') brut = chaînes[Number(v)] ?? '';
      else if (type === 'inlineStr') brut = Array.from(cellule.getElementsByTagNameNS('*', 't')).map((t) => t.textContent ?? '').join('');
      else if (type === 'b') brut = v === '1' ? '=VRAI()' : '=FAUX()';
      else if (type === 'str' || type === 'e' || type === 'd') brut = v;
      else if (v !== '' && Number.isFinite(Number(v))) brut = String(Number(v)).replace('.', ',');
      const adresse = address(a.r, a.c);
      if (brut !== '') doc.cells[adresse] = brut;
      const style = styles[Number(cellule.getAttribute('s') ?? 0)];
      if (style) doc.styles[adresse] = { ...style };
      if (brut !== '' || style) {
        dernièreLigne = Math.max(dernièreLigne, a.r);
        dernièreColonne = Math.max(dernièreColonne, a.c);
      }
    }
  }

  for (const col of enfants(premier(feuille.documentElement, 'cols'), 'col')) {
    const largeur = Number(col.getAttribute('width'));
    const min = Number(col.getAttribute('min'));
    const max = Math.min(Number(col.getAttribute('max')), MAX_COLS);
    if (!Number.isFinite(largeur) || largeur <= 0 || !min) continue;
    for (let c = min - 1; c < max && c - (min - 1) < 300; c++) doc.colWidths[String(c)] = Math.max(30, Math.min(600, Math.round(largeur * PIXELS_PAR_CARACTÈRE + 5)));
  }

  doc.rows = Math.max(DEFAULT_ROWS, Math.min(MAX_ROWS, dernièreLigne + 50));
  doc.cols = Math.max(DEFAULT_COLS, Math.min(MAX_COLS, dernièreColonne + 1));
  if (feuilles.length > 1) warnings.push('Seule la première feuille du classeur est reprise.');
  if (premier(feuille.documentElement, 'mergeCells')) warnings.push('Les cellules fusionnées ne sont pas reprises.');
  if (Object.keys(fichiers).some((n) => /^xl\/(drawings|charts)\//.test(n))) warnings.push('Les graphiques et les images ne sont pas repris.');
  if (tropGrand) warnings.push(`Le classeur est trop grand : seuls ${MAX_ROWS} lignes et ${MAX_COLS} colonnes sont repris.`);
  return { doc, warnings };
}
