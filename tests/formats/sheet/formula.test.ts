import { describe, expect, it } from 'vitest';
import { enToFrFormula, frToEnFormula, shiftReferences } from '../../../src/formats/sheet/formula';
import { address, colIndex, colName, parseAddress } from '../../../src/formats/sheet/model';

describe('adresses', () => {
  it('convertit lettres et numéros de colonnes', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(colName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
    expect(['A', 'Z', 'AA', 'ZZ', 'AAA'].map(colIndex)).toEqual([0, 25, 26, 701, 702]);
    for (let c = 0; c < 800; c++) expect(colIndex(colName(c))).toBe(c);
  });

  it('lit et écrit les adresses de cellules', () => {
    expect(address(0, 0)).toBe('A1');
    expect(address(11, 27)).toBe('AB12');
    expect(parseAddress('c7')).toEqual({ r: 6, c: 2 });
    expect(parseAddress('AB12')).toEqual({ r: 11, c: 27 });
    expect(parseAddress('12A')).toBeNull();
    expect(parseAddress('')).toBeNull();
  });
});

describe('traduction des formules', () => {
  it("passe du français à l'anglais, séparateurs et décimales compris", () => {
    expect(frToEnFormula('=SOMME(A1:B2;10,5)')).toBe('=SUM(A1:B2,10.5)');
    expect(frToEnFormula('=SI(A1>0,5;MOYENNE(A1:A9);0)')).toBe('=IF(A1>0.5,AVERAGE(A1:A9),0)');
    expect(frToEnFormula('=NB.SI(A1:A9;">3")')).toBe('=COUNTIF(A1:A9,">3")');
  });

  it("passe de l'anglais au français", () => {
    expect(enToFrFormula('=SUM(A1:B2,10.5)')).toBe('=SOMME(A1:B2;10,5)');
    expect(enToFrFormula('=IF(A1>0.5,AVERAGE(A1:A9),0)')).toBe('=SI(A1>0,5;MOYENNE(A1:A9);0)');
    expect(enToFrFormula('=A1*.5')).toBe('=A1*,5');
  });

  it('ne touche jamais au texte entre guillemets', () => {
    expect(frToEnFormula('=SI(A1>0;"a;b, 1,5 SOMME(x)";"d")')).toBe('=IF(A1>0,"a;b, 1,5 SOMME(x)","d")');
    expect(enToFrFormula('=IF(A1>0,"non, merci 1.5 SUM(x)","d")')).toBe('=SI(A1>0;"non, merci 1.5 SUM(x)";"d")');
    expect(frToEnFormula('=CONCATENER("il dit ""oui""";B1)')).toBe('=CONCATENATE("il dit ""oui""",B1)');
  });

  it('garde les fonctions inconnues et fait un aller-retour', () => {
    expect(frToEnFormula('=FONCTIONINCONNUE(A1;2)')).toBe('=FONCTIONINCONNUE(A1,2)');
    for (const f of ['=SOMME(A1:B2;10,5)', '=SI(ET(A1>1;B1<2,5);"oui";"non")', '=ARRONDI(A1/3;2)+MAX(A1:A3)']) {
      expect(enToFrFormula(frToEnFormula(f))).toBe(f);
    }
  });
});

describe('décalage des références', () => {
  it('décale les références relatives et garde les absolues', () => {
    expect(shiftReferences('=A1+B$2+$C3+$D$4', 1, 1)).toBe('=B2+C$2+$C4+$D$4');
    expect(shiftReferences('=SOMME(A1:A3)', 2, 0)).toBe('=SOMME(A3:A5)');
    expect(shiftReferences('=A1', 0, 27)).toBe('=AB1');
  });

  it('ne prend pas un nom de fonction ni du texte pour une référence', () => {
    expect(shiftReferences('=LOG10(A1)', 1, 0)).toBe('=LOG10(A2)');
    expect(shiftReferences('=SI(A1>0;"A1";B2)', 1, 0)).toBe('=SI(A2>0;"A1";B3)');
    expect(shiftReferences('=2*3', 5, 5)).toBe('=2*3');
  });

  it('marque #REF! ce qui sortirait de la feuille', () => {
    expect(shiftReferences('=A1+B2', -1, 0)).toBe('=#REF!+B1');
    expect(shiftReferences('=B2', 0, -2)).toBe('=#REF!');
  });
});
