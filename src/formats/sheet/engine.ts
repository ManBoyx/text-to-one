import { DetailedCellError, HyperFormula, type RawCellContent } from 'hyperformula';
import frFR from 'hyperformula/i18n/languages/frFR';
import { shiftReferences } from './formula';
import { depuisJsonCompact, enJsonCompact } from '../../shared/media';
import { DEFAULT_COL_WIDTH, MAX_COLS, MAX_ROWS, address, emptySheet, parseAddress, type CellStyle, type MediaCell, type NumberFormat, type SheetDoc } from './model';

if (!HyperFormula.getRegisteredLanguagesCodes().includes('frFR')) HyperFormula.registerLanguage('frFR', frFR);

/** Formules et nombres à la française : « =SOMME(A1;B1) », « 12,5 ». La licence est celle des logiciels libres (GPL). */
const CONFIGURATION = {
  licenseKey: 'gpl-v3',
  language: 'frFR',
  functionArgSeparator: ';',
  decimalSeparator: ',',
  arrayColumnSeparator: ';',
  arrayRowSeparator: '|',
  maxRows: MAX_ROWS + 1000,
  maxColumns: MAX_COLS + 100,
} as const;

export type CellValue = number | string | boolean | null | { error: string };

export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

/** Ce qu'on garde en mémoire quand on copie des cellules : le contenu saisi et le style, avec leur position d'origine. */
export interface ClipboardPayload {
  origin: { r: number; c: number };
  raw: string[][];
  styles: (CellStyle | undefined)[][];
}

const HISTORIQUE_MAX = 100;

export function formatNumber(v: number, format: NumberFormat | undefined): string {
  switch (format) {
    case 'int':
      return v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    case 'dec2':
      return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'percent':
      return `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
    case 'eur':
      return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    default:
      return String(Number(v.toPrecision(12))).replace('.', ','); // 0,1 + 0,2 s'affiche 0,3, pas 0,30000000000000004
  }
}

export const normaliserRange = (r1: number, c1: number, r2: number, c2: number): Range => ({
  r1: Math.min(r1, r2),
  c1: Math.min(c1, c2),
  r2: Math.max(r1, r2),
  c2: Math.max(c1, c2),
});

/** Le moteur d'un classeur : calculs, styles, structure, copier-coller et historique « annuler ». */
export class SheetEngine {
  rows = 0;
  cols = 0;
  private hf!: HyperFormula;
  private styles = new Map<string, CellStyle>();
  private largeurs = new Map<number, number>();
  private médias = new Map<string, MediaCell>();
  private historique: string[] = [];
  private position = -1;

  constructor(doc: SheetDoc = emptySheet()) {
    this.load(doc);
    this.historique = [enJsonCompact(this.toDoc())];
    this.position = 0;
  }

  /** Ouvre un autre classeur : le contenu est remplacé et l'historique « annuler » repart de zéro. */
  reset(doc: SheetDoc): void {
    this.load(doc);
    this.historique = [enJsonCompact(this.toDoc())];
    this.position = 0;
  }

  /** Remplace tout le contenu (ouverture d'un fichier, annulation). */
  load(doc: SheetDoc): void {
    this.hf?.destroy();
    let dernièreLigne = 0;
    let dernièreColonne = 0;
    const saisies: [number, number, string][] = [];
    for (const [adresse, brut] of Object.entries(doc.cells)) {
      const a = parseAddress(adresse);
      if (!a || typeof brut !== 'string') continue;
      saisies.push([a.r, a.c, brut]);
      dernièreLigne = Math.max(dernièreLigne, a.r);
      dernièreColonne = Math.max(dernièreColonne, a.c);
    }
    const données: RawCellContent[][] = Array.from({ length: dernièreLigne + 1 }, () => Array<RawCellContent>(dernièreColonne + 1).fill(null));
    for (const [r, c, brut] of saisies) données[r][c] = brut === '' ? null : brut;
    this.hf = HyperFormula.buildFromArray(données, CONFIGURATION);
    this.rows = Math.min(MAX_ROWS, Math.max(doc.rows, dernièreLigne + 1));
    this.cols = Math.min(MAX_COLS, Math.max(doc.cols, dernièreColonne + 1));
    this.styles = new Map(Object.entries(doc.styles ?? {}));
    this.largeurs = new Map(Object.entries(doc.colWidths ?? {}).map(([c, l]) => [Number(c), Number(l)]));
    this.médias = new Map(Object.entries(doc.media ?? {}).filter(([, m]) => m.src !== ''));
  }

  toDoc(): SheetDoc {
    const cells: Record<string, string> = {};
    this.hf.getSheetSerialized(0).forEach((ligne, r) =>
      ligne.forEach((brut, c) => {
        if (brut !== null && brut !== undefined && brut !== '') cells[address(r, c)] = String(brut);
      }),
    );
    return {
      rows: this.rows,
      cols: this.cols,
      cells,
      styles: Object.fromEntries(this.styles),
      colWidths: Object.fromEntries([...this.largeurs].map(([c, l]) => [String(c), l])),
      ...(this.médias.size ? { media: Object.fromEntries(this.médias) } : {}),
    };
  }

  // ---------- Sons et vidéos ----------

  media(r: number, c: number): MediaCell | undefined {
    return this.médias.get(address(r, c));
  }

  get nombreDeMédias(): number {
    return this.médias.size;
  }

  /** Rattache un son ou une vidéo à une cellule (null pour l'enlever). */
  setMedia(r: number, c: number, média: MediaCell | null): void {
    if (média) this.médias.set(address(r, c), média);
    else this.médias.delete(address(r, c));
  }

  // ---------- Lecture ----------

  raw(r: number, c: number): string {
    const brut = this.hf.getCellSerialized({ sheet: 0, row: r, col: c });
    return brut === null || brut === undefined ? '' : String(brut);
  }

  value(r: number, c: number): CellValue {
    const v = this.hf.getCellValue({ sheet: 0, row: r, col: c });
    if (v instanceof DetailedCellError) return { error: v.value };
    return v === undefined ? null : (v as CellValue);
  }

  display(r: number, c: number): string {
    const v = this.value(r, c);
    if (v === null) return '';
    if (typeof v === 'object') return v.error;
    if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
    if (typeof v === 'string') return v;
    return formatNumber(v, this.style(r, c).n);
  }

  colWidth(c: number): number {
    return this.largeurs.get(c) ?? DEFAULT_COL_WIDTH;
  }

  setColWidth(c: number, largeur: number): void {
    this.largeurs.set(c, Math.max(30, Math.min(600, Math.round(largeur))));
  }

  style(r: number, c: number): CellStyle {
    return this.styles.get(address(r, c)) ?? {};
  }

  /** Somme, moyenne et nombre des nombres d'une zone (barre d'état). */
  stats(zone: Range): { count: number; sum: number; average: number } {
    let count = 0;
    let sum = 0;
    for (let r = zone.r1; r <= zone.r2; r++) {
      for (let c = zone.c1; c <= zone.c2; c++) {
        const v = this.value(r, c);
        if (typeof v === 'number') {
          count++;
          sum += v;
        }
      }
    }
    return { count, sum, average: count ? sum / count : 0 };
  }

  // ---------- Modification ----------

  setRaw(r: number, c: number, brut: string): void {
    this.hf.setCellContents({ sheet: 0, row: r, col: c }, [[brut === '' ? null : brut]]);
    this.rows = Math.min(MAX_ROWS, Math.max(this.rows, r + 1));
    this.cols = Math.min(MAX_COLS, Math.max(this.cols, c + 1));
  }

  /** Change le style d'une zone ; une valeur `undefined` retire la propriété. */
  setStyle(zone: Range, patch: Partial<CellStyle>): void {
    for (let r = zone.r1; r <= zone.r2; r++) {
      for (let c = zone.c1; c <= zone.c2; c++) {
        const suivant: CellStyle = { ...this.style(r, c), ...patch };
        for (const clé of Object.keys(suivant) as (keyof CellStyle)[]) if (suivant[clé] === undefined || suivant[clé] === false) delete suivant[clé];
        if (suivant.n === 'general') delete suivant.n;
        if (Object.keys(suivant).length) this.styles.set(address(r, c), suivant);
        else this.styles.delete(address(r, c));
      }
    }
  }

  clear(zone: Range): void {
    for (let r = zone.r1; r <= zone.r2; r++) for (let c = zone.c1; c <= zone.c2; c++) if (this.raw(r, c) !== '') this.setRaw(r, c, '');
  }

  insertRow(à: number): void {
    if (this.rows >= MAX_ROWS) return;
    this.hf.addRows(0, [à, 1]);
    this.rows++;
    this.décalerStyles((r, c) => ({ r: r >= à ? r + 1 : r, c }));
  }

  deleteRow(à: number): void {
    this.hf.removeRows(0, [à, 1]);
    this.rows = Math.max(1, this.rows - 1);
    this.décalerStyles((r, c) => (r === à ? null : { r: r > à ? r - 1 : r, c }));
  }

  insertCol(à: number): void {
    if (this.cols >= MAX_COLS) return;
    this.hf.addColumns(0, [à, 1]);
    this.cols++;
    this.décalerStyles((r, c) => ({ r, c: c >= à ? c + 1 : c }));
    this.largeurs = new Map([...this.largeurs].map(([c, l]) => [c >= à ? c + 1 : c, l]));
  }

  deleteCol(à: number): void {
    this.hf.removeColumns(0, [à, 1]);
    this.cols = Math.max(1, this.cols - 1);
    this.décalerStyles((r, c) => (c === à ? null : { r, c: c > à ? c - 1 : c }));
    this.largeurs = new Map([...this.largeurs].filter(([c]) => c !== à).map(([c, l]) => [c > à ? c - 1 : c, l]));
  }

  /** Les styles et les médias suivent leurs cellules quand des lignes ou des colonnes sont insérées ou supprimées. */
  private décalerStyles(déplacer: (r: number, c: number) => { r: number; c: number } | null): void {
    const décaler = <T>(source: Map<string, T>): Map<string, T> => {
      const suivants = new Map<string, T>();
      for (const [adresse, valeur] of source) {
        const a = parseAddress(adresse);
        const nouvelle = a && déplacer(a.r, a.c);
        if (nouvelle) suivants.set(address(nouvelle.r, nouvelle.c), valeur);
      }
      return suivants;
    };
    this.styles = décaler(this.styles);
    this.médias = décaler(this.médias);
  }

  // ---------- Copier-coller ----------

  copy(zone: Range): ClipboardPayload {
    const lignes = zone.r2 - zone.r1 + 1;
    const colonnes = zone.c2 - zone.c1 + 1;
    return {
      origin: { r: zone.r1, c: zone.c1 },
      raw: Array.from({ length: lignes }, (_, i) => Array.from({ length: colonnes }, (_, j) => this.raw(zone.r1 + i, zone.c1 + j))),
      styles: Array.from({ length: lignes }, (_, i) => Array.from({ length: colonnes }, (_, j) => this.styles.get(address(zone.r1 + i, zone.c1 + j)))),
    };
  }

  /** Colle en décalant les références des formules ; renvoie la zone couverte. */
  paste(contenu: ClipboardPayload, r: number, c: number): Range {
    const dr = r - contenu.origin.r;
    const dc = c - contenu.origin.c;
    contenu.raw.forEach((ligne, i) =>
      ligne.forEach((brut, j) => {
        this.setRaw(r + i, c + j, brut.startsWith('=') ? shiftReferences(brut, dr, dc) : brut);
        const style = contenu.styles[i][j];
        this.setStyle({ r1: r + i, c1: c + j, r2: r + i, c2: c + j }, { b: undefined, i: undefined, a: undefined, c: undefined, f: undefined, n: undefined });
        if (style) this.setStyle({ r1: r + i, c1: c + j, r2: r + i, c2: c + j }, style);
      }),
    );
    return { r1: r, c1: c, r2: r + contenu.raw.length - 1, c2: c + (contenu.raw[0]?.length ?? 1) - 1 };
  }

  /** Colle du texte venu d'ailleurs (colonnes séparées par des tabulations) ; renvoie la zone couverte. */
  pasteText(texte: string, r: number, c: number): Range {
    const lignes = texte.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    lignes.forEach((ligne, i) => ligne.forEach((brut, j) => this.setRaw(r + i, c + j, brut)));
    return { r1: r, c1: c, r2: r + lignes.length - 1, c2: c + Math.max(...lignes.map((l) => l.length)) - 1 };
  }

  /** Ce qui s'affiche dans une zone, en texte à tabulations (pour coller dans une autre application). */
  toTsv(zone: Range): string {
    const lignes: string[] = [];
    for (let r = zone.r1; r <= zone.r2; r++) {
      const cellules: string[] = [];
      for (let c = zone.c1; c <= zone.c2; c++) cellules.push(this.display(r, c));
      lignes.push(cellules.join('\t'));
    }
    return lignes.join('\n');
  }

  // ---------- Historique ----------

  /** À appeler après chaque action de l'utilisateur : garde un point de retour pour « annuler ». */
  commit(): void {
    const instantané = enJsonCompact(this.toDoc());
    if (instantané === this.historique[this.position]) return;
    this.historique = [...this.historique.slice(0, this.position + 1), instantané].slice(-HISTORIQUE_MAX);
    this.position = this.historique.length - 1;
  }

  canUndo(): boolean {
    return this.position > 0;
  }

  canRedo(): boolean {
    return this.position < this.historique.length - 1;
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    this.load(depuisJsonCompact<SheetDoc>(this.historique[--this.position]));
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    this.load(depuisJsonCompact<SheetDoc>(this.historique[++this.position]));
    return true;
  }
}
