import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FormatError } from '../../../src/formats/errors';
import { csvFromSheet, detectDelimiter, parseCsv, sheetFromCsv, toCsv } from '../../../src/formats/sheet/csv';
import { emptySheet, type SheetDoc } from '../../../src/formats/sheet/model';
import { nettoyerClasseur, packSheet, unpackSheet } from '../../../src/formats/sheet/tts';

const exemple = (): SheetDoc => ({
  rows: 300,
  cols: 30,
  cells: { A1: 'Produit', B1: 'Prix', A2: 'Stylo', B2: '1,5', B3: '=SOMME(B2:B2)*2' },
  styles: { A1: { b: true, f: '#ffff00' }, B2: { n: 'eur', a: 'right' } },
  colWidths: { '0': 180 },
});

describe('format .tts', () => {
  it("relit exactement ce qu'il a enregistré", () => {
    expect(unpackSheet(packSheet(exemple()))).toEqual(exemple());
  });

  it("refuse ce qui n'est pas un classeur, avec un message clair", () => {
    expect(() => unpackSheet(new Uint8Array([1, 2, 3]))).toThrow(FormatError);
    expect(() => unpackSheet(zipSync({ 'sheet.json': strToU8('{}') }))).toThrow(/pas un classeur Text to One/);
    const manifeste = (m: object) => strToU8(JSON.stringify(m));
    expect(() => unpackSheet(zipSync({ 'manifest.json': manifeste({ format: 'text-to-one-sheet', version: 99 }), 'sheet.json': strToU8('{}') }))).toThrow(/version plus récente/);
    expect(() => unpackSheet(zipSync({ 'manifest.json': manifeste({ format: 'autre', version: 1 }), 'sheet.json': strToU8('{}') }))).toThrow(FormatError);
    expect(() => unpackSheet(zipSync({ 'manifest.json': manifeste({ format: 'text-to-one-sheet', version: 1 }), 'sheet.json': strToU8('{cassé') }))).toThrow(FormatError);
  });

  it("nettoie un classeur abîmé ou hostile sans rien casser", () => {
    const doc = nettoyerClasseur({
      rows: -5,
      cols: 'beaucoup',
      cells: { A1: 'ok', ZZZ99999999: 'x', '__proto__': 'x', B2: 12, C3: null, 'a1b': 'x', d4: 'minuscule' },
      styles: { A1: { b: 'oui', c: 'rouge', f: '#12345g', a: 'diagonale', n: 'monnaie', extra: 1 }, B1: { b: true, c: '#AABBCC', n: 'percent' }, 'pas une adresse': { b: true } },
      colWidths: { '0': 99999, x: 5, '1': 'large', '2': 10 },
    });
    expect(doc.cells).toEqual({ A1: 'ok', D4: 'minuscule' });
    expect(doc.styles).toEqual({ B1: { b: true, c: '#AABBCC', n: 'percent' } });
    expect(doc.colWidths).toEqual({ '0': 600, '2': 30 });
    expect(doc.rows).toBe(1);
    expect(doc.cols).toBe(26);
    expect(nettoyerClasseur(null)).toEqual({ ...emptySheet() });
    expect(nettoyerClasseur('texte')).toEqual({ ...emptySheet() });
  });
});

describe('CSV', () => {
  it('devine le séparateur', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('"a;b",c')).toBe(',');
    expect(detectDelimiter('seul')).toBe(',');
  });

  it('lit les guillemets, les séparateurs et les retours à la ligne dans les champs', () => {
    expect(parseCsv('a;"b;c";"il dit ""oui"""\r\n1;"deux\nlignes";3\n', ';')).toEqual([
      ['a', 'b;c', 'il dit "oui"'],
      ['1', 'deux\nlignes', '3'],
    ]);
    expect(parseCsv('a,b\n\n1,2')).toEqual([['a', 'b'], [''], ['1', '2']]);
    expect(parseCsv('')).toEqual([]);
  });

  it('écrit du CSV lisible par Excel en français', () => {
    const csv = toCsv([['a', 'b;c', 'il dit "oui"'], ['1', '2,5', '']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿a;"b;c";"il dit ""oui"""\r\n1;2,5;\r\n');
    expect(parseCsv(csv.slice(1))).toEqual([['a', 'b;c', 'il dit "oui"'], ['1', '2,5', '']]);
  });

  it("ouvre un CSV et convertit les décimales d'un CSV à l'anglaise", () => {
    const francais = sheetFromCsv('﻿Nom;Prix\nStylo;1,5\n');
    expect(francais.doc.cells).toEqual({ A1: 'Nom', B1: 'Prix', A2: 'Stylo', B2: '1,5' });
    const anglais = sheetFromCsv('Nom,Prix\nStylo,1.5\nGomme,"2,5"\n');
    expect(anglais.doc.cells).toEqual({ A1: 'Nom', B1: 'Prix', A2: 'Stylo', B2: '1,5', A3: 'Gomme', B3: '2,5' });
  });

  it("exporte ce qui s'affiche, pas les formules, sans lignes ni colonnes vides", () => {
    const csv = csvFromSheet(exemple());
    expect(csv).toBe('﻿Produit;Prix\r\nStylo;1,5\r\n;3\r\n');
    expect(csvFromSheet(emptySheet())).toBe('﻿\r\n');
  });
});
