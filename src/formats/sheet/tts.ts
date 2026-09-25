import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { FormatError } from '../errors';
import { DEFAULT_COLS, DEFAULT_ROWS, MAX_COLS, MAX_ROWS, parseAddress, type Alignment, type CellStyle, type NumberFormat, type SheetDoc } from './model';

export const TTS_FORMAT_VERSION = 1;
const INVALIDE = "Ce fichier n'est pas un classeur Text to One valide.";
const TAILLE_MAX_FICHIER = 200 * 1024 * 1024;
const FORMATS: NumberFormat[] = ['general', 'int', 'dec2', 'percent', 'eur'];
const ALIGNEMENTS: Alignment[] = ['left', 'center', 'right'];
const COULEUR = /^#[0-9a-fA-F]{6}$/;

const entier = (valeur: unknown, défaut: number, max: number): number =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? Math.max(1, Math.min(max, Math.floor(valeur))) : défaut;

/** Ne garde d'un classeur que ce qui est valide : un fichier abîmé ou malveillant ne doit rien casser. */
export function nettoyerClasseur(brut: unknown): SheetDoc {
  const o = (typeof brut === 'object' && brut !== null ? brut : {}) as Record<string, unknown>;
  const cells: Record<string, string> = {};
  for (const [adresse, valeur] of Object.entries((o.cells ?? {}) as Record<string, unknown>)) {
    const a = parseAddress(adresse);
    if (a && a.r < MAX_ROWS && a.c < MAX_COLS && typeof valeur === 'string') cells[adresse.toUpperCase()] = valeur;
  }
  const styles: Record<string, CellStyle> = {};
  for (const [adresse, s] of Object.entries((o.styles ?? {}) as Record<string, Record<string, unknown>>)) {
    if (!parseAddress(adresse) || typeof s !== 'object' || s === null) continue;
    const style: CellStyle = {};
    if (s.b === true) style.b = true;
    if (s.i === true) style.i = true;
    if (ALIGNEMENTS.includes(s.a as Alignment)) style.a = s.a as Alignment;
    if (typeof s.c === 'string' && COULEUR.test(s.c)) style.c = s.c;
    if (typeof s.f === 'string' && COULEUR.test(s.f)) style.f = s.f;
    if (FORMATS.includes(s.n as NumberFormat) && s.n !== 'general') style.n = s.n as NumberFormat;
    if (Object.keys(style).length) styles[adresse.toUpperCase()] = style;
  }
  const colWidths: Record<string, number> = {};
  for (const [c, l] of Object.entries((o.colWidths ?? {}) as Record<string, unknown>)) {
    if (/^\d+$/.test(c) && Number(c) < MAX_COLS && typeof l === 'number' && Number.isFinite(l)) colWidths[c] = Math.max(30, Math.min(600, Math.round(l)));
  }
  return { rows: entier(o.rows, DEFAULT_ROWS, MAX_ROWS), cols: entier(o.cols, DEFAULT_COLS, MAX_COLS), cells, styles, colWidths };
}

/** Écrit un classeur : archive zip avec manifest.json et sheet.json. */
export function packSheet(doc: SheetDoc): Uint8Array {
  return zipSync(
    {
      'manifest.json': strToU8(JSON.stringify({ format: 'text-to-one-sheet', version: TTS_FORMAT_VERSION })),
      'sheet.json': strToU8(JSON.stringify(doc)),
    },
    { level: 6 },
  );
}

/** Relit un classeur ; lève une FormatError au message clair si le fichier est invalide. */
export function unpackSheet(octets: Uint8Array): SheetDoc {
  let fichiers: Record<string, Uint8Array>;
  try {
    fichiers = unzipSync(octets, { filter: (f) => f.originalSize <= TAILLE_MAX_FICHIER });
  } catch {
    throw new FormatError(INVALIDE);
  }
  const manifesteBrut = fichiers['manifest.json'];
  const feuilleBrute = fichiers['sheet.json'];
  if (!manifesteBrut || !feuilleBrute) throw new FormatError(INVALIDE);
  let manifeste: { format?: unknown; version?: unknown } | null;
  let feuille: unknown;
  try {
    manifeste = JSON.parse(strFromU8(manifesteBrut));
    feuille = JSON.parse(strFromU8(feuilleBrute));
  } catch {
    throw new FormatError(INVALIDE);
  }
  if (manifeste?.format !== 'text-to-one-sheet' || typeof manifeste.version !== 'number') throw new FormatError(INVALIDE);
  if (manifeste.version > TTS_FORMAT_VERSION) {
    throw new FormatError("Ce classeur a été créé avec une version plus récente de Text to One. Mets le logiciel à jour pour l'ouvrir.");
  }
  if (typeof feuille !== 'object' || feuille === null) throw new FormatError(INVALIDE);
  return nettoyerClasseur(feuille);
}
