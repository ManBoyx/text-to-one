export type NumberFormat = 'general' | 'int' | 'dec2' | 'percent' | 'eur';
export type Alignment = 'left' | 'center' | 'right';

/** Le style d'une cellule ; les clés sont courtes car il y en a beaucoup dans un fichier. */
export interface CellStyle {
  b?: boolean;
  i?: boolean;
  a?: Alignment;
  /** Couleur du texte, « #rrggbb ». */
  c?: string;
  /** Couleur de fond, « #rrggbb ». */
  f?: string;
  n?: NumberFormat;
}

/**
 * Un classeur d'une feuille. Seul ce que l'utilisateur a saisi est enregistré (texte, nombres, formules),
 * jamais les résultats : ils se recalculent à l'ouverture.
 */
export interface SheetDoc {
  rows: number;
  cols: number;
  /** Adresse « A1 » → contenu saisi (« 12,5 », « bonjour », « =SOMME(A1:A3) »). */
  cells: Record<string, string>;
  styles: Record<string, CellStyle>;
  /** Numéro de colonne (à partir de 0) → largeur en pixels. */
  colWidths: Record<string, number>;
}

export const DEFAULT_ROWS = 200;
export const DEFAULT_COLS = 26;
export const MAX_ROWS = 20000;
export const MAX_COLS = 200;
export const DEFAULT_COL_WIDTH = 100;
export const ROW_HEIGHT = 24;

export const emptySheet = (): SheetDoc => ({ rows: DEFAULT_ROWS, cols: DEFAULT_COLS, cells: {}, styles: {}, colWidths: {} });

/** 0 → « A », 25 → « Z », 26 → « AA ». */
export function colName(c: number): string {
  let nom = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) nom = String.fromCharCode(65 + ((n - 1) % 26)) + nom;
  return nom;
}

/** « A » → 0, « AA » → 26. */
export function colIndex(nom: string): number {
  let c = 0;
  for (const lettre of nom.toUpperCase()) c = c * 26 + (lettre.charCodeAt(0) - 64);
  return c - 1;
}

export const address = (r: number, c: number): string => `${colName(c)}${r + 1}`;

export function parseAddress(texte: string): { r: number; c: number } | null {
  const m = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(texte.trim());
  return m ? { r: Number(m[2]) - 1, c: colIndex(m[1]) } : null;
}
