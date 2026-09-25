import { SheetEngine, formatNumber } from './engine';
import { DEFAULT_COLS, DEFAULT_ROWS, MAX_COLS, MAX_ROWS, address, emptySheet, parseAddress, type SheetDoc } from './model';

type Séparateur = ';' | ',' | '\t';

/** Devine le séparateur d'après la première ligne : « ; » (Excel en français), tabulation, sinon « , ». */
export function detectDelimiter(texte: string): Séparateur {
  const première = texte.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  let entreGuillemets = false;
  const nombre: Record<string, number> = { ';': 0, '\t': 0, ',': 0 };
  for (const c of première) {
    if (c === '"') entreGuillemets = !entreGuillemets;
    else if (!entreGuillemets && c in nombre) nombre[c]++;
  }
  if (nombre[';'] >= nombre['\t'] && nombre[';'] >= nombre[','] && nombre[';'] > 0) return ';';
  if (nombre['\t'] >= nombre[','] && nombre['\t'] > 0) return '\t';
  return ',';
}

export function parseCsv(texte: string, séparateur: Séparateur = detectDelimiter(texte)): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let entreGuillemets = false;
  const finirChamp = () => {
    ligne.push(champ);
    champ = '';
  };
  const finirLigne = () => {
    finirChamp();
    lignes.push(ligne);
    ligne = [];
  };
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') entreGuillemets = false;
      else champ += c;
    } else if (c === '"' && champ === '') entreGuillemets = true;
    else if (c === séparateur) finirChamp();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      finirLigne();
    } else champ += c;
  }
  if (champ !== '' || ligne.length) finirLigne();
  return lignes;
}

const échapper = (valeur: string, séparateur: string): string =>
  /["\r\n]/.test(valeur) || valeur.includes(séparateur) ? `"${valeur.replace(/"/g, '""')}"` : valeur;

/** Du CSV compris par Excel en français : séparateur « ; », accents en UTF-8 (avec l'indicateur BOM). */
export function toCsv(lignes: string[][], séparateur = ';'): string {
  return `﻿${lignes.map((l) => l.map((v) => échapper(v, séparateur)).join(séparateur)).join('\r\n')}\r\n`;
}

export function sheetFromCsv(texte: string): { doc: SheetDoc; warnings: string[] } {
  const sansBom = texte.replace(/^﻿/, '');
  const séparateur = detectDelimiter(sansBom);
  const lignes = parseCsv(sansBom, séparateur);
  const doc = emptySheet();
  const warnings: string[] = [];
  let colonnes = 0;
  lignes.slice(0, MAX_ROWS).forEach((ligne, r) => {
    ligne.slice(0, MAX_COLS).forEach((valeur, c) => {
      // Un CSV « à l'anglaise » écrit 12.5 ; notre tableur attend 12,5.
      const brut = séparateur !== ';' && /^-?\d+\.\d+$/.test(valeur) ? valeur.replace('.', ',') : valeur;
      if (brut !== '') doc.cells[address(r, c)] = brut;
    });
    colonnes = Math.max(colonnes, Math.min(ligne.length, MAX_COLS));
  });
  if (lignes.length > MAX_ROWS || colonnes >= MAX_COLS) warnings.push(`Le fichier est trop grand : seuls ${MAX_ROWS} lignes et ${MAX_COLS} colonnes sont repris.`);
  doc.rows = Math.max(DEFAULT_ROWS, Math.min(MAX_ROWS, lignes.length + 50));
  doc.cols = Math.max(DEFAULT_COLS, Math.min(MAX_COLS, colonnes));
  return { doc, warnings };
}

/** Exporte les valeurs (les résultats des formules, pas les formules), du coin A1 à la dernière cellule utilisée. */
export function csvFromSheet(doc: SheetDoc): string {
  const moteur = new SheetEngine(doc);
  let dernièreLigne = -1;
  let dernièreColonne = -1;
  for (const adresse of Object.keys(doc.cells)) {
    const a = parseAddress(adresse);
    if (a && moteur.raw(a.r, a.c) !== '') {
      dernièreLigne = Math.max(dernièreLigne, a.r);
      dernièreColonne = Math.max(dernièreColonne, a.c);
    }
  }
  const lignes: string[][] = [];
  // La valeur, pas sa mise en forme : « 1,5 » et non « 1,50 € », pour qu'un CSV se relise comme des nombres.
  const valeur = (r: number, c: number) => {
    const v = moteur.value(r, c);
    return typeof v === 'number' ? formatNumber(v, 'general') : moteur.display(r, c);
  };
  for (let r = 0; r <= dernièreLigne; r++) lignes.push(Array.from({ length: dernièreColonne + 1 }, (_, c) => valeur(r, c)));
  return toCsv(lignes);
}
