import { describe, expect, it } from 'vitest';
import { SheetEngine, formatNumber } from '../../../src/formats/sheet/engine';
import { emptySheet, type SheetDoc } from '../../../src/formats/sheet/model';

const classeur = (cells: Record<string, string>, extra: Partial<SheetDoc> = {}): SheetEngine => new SheetEngine({ ...emptySheet(), cells, ...extra });
const zone = (r1: number, c1: number, r2 = r1, c2 = c1) => ({ r1, c1, r2, c2 });

describe('calculs', () => {
  it('calcule des formules en français avec des nombres à virgule', () => {
    const e = classeur({ A1: '1', B1: '2,5', C1: '=SOMME(A1:B1)', A2: '10%', B2: '=SI(A1>0;"positif";"négatif")', C2: '=MOYENNE(A1:B1)*2' });
    expect(e.value(0, 2)).toBe(3.5);
    expect(e.value(1, 0)).toBe(0.1);
    expect(e.value(1, 1)).toBe('positif');
    expect(e.value(1, 2)).toBe(3.5);
    expect(e.display(0, 2)).toBe('3,5');
    expect(e.raw(0, 1)).toBe('2,5');
    expect(e.raw(0, 2)).toBe('=SOMME(A1:B1)');
  });

  it('affiche les erreurs, les booléens et le texte', () => {
    const e = classeur({ A1: '=1/0', B1: '=A1>0', C1: 'bonjour', D1: '=VRAI()', E1: '=INCONNUE(1)' });
    expect(e.value(0, 0)).toEqual({ error: '#DIV/0!' });
    expect(e.display(0, 0)).toBe('#DIV/0!');
    expect(e.display(0, 2)).toBe('bonjour');
    expect(e.display(0, 3)).toBe('VRAI');
    expect(e.display(0, 4)).toMatch(/^#/);
  });

  it('recalcule ce qui dépend d\'une cellule modifiée', () => {
    const e = classeur({ A1: '2', A2: '3', A3: '=A1*A2', A4: '=A3+1' });
    expect(e.value(3, 0)).toBe(7);
    e.setRaw(0, 0, '10');
    expect(e.value(3, 0)).toBe(31);
    e.setRaw(0, 0, '');
    expect(e.value(2, 0)).toBe(0);
  });

  it('détecte les références circulaires sans planter', () => {
    const e = classeur({ A1: '=B1', B1: '=A1' });
    expect(typeof e.display(0, 0)).toBe('string');
    expect(e.display(0, 0)).toMatch(/^#/);
  });

  it('reste rapide sur une grande feuille', () => {
    const cells: Record<string, string> = {};
    for (let r = 1; r <= 2000; r++) {
      cells[`A${r}`] = String(r);
      cells[`B${r}`] = `=A${r}*2`;
    }
    cells.C1 = '=SOMME(B1:B2000)';
    const début = Date.now();
    const e = classeur(cells, { rows: 2500 });
    expect(e.value(0, 2)).toBe(4_002_000);
    e.setRaw(0, 0, '1000');
    expect(e.value(0, 2)).toBe(4_003_998);
    expect(Date.now() - début).toBeLessThan(3000);
  });
});

describe('affichage des nombres', () => {
  it('applique les formats', () => {
    expect(formatNumber(0.1 + 0.2, 'general')).toBe('0,3');
    expect(formatNumber(1234.5, 'general')).toBe('1234,5');
    expect(formatNumber(1234.56, 'int').replace(/\s/g, ' ')).toBe('1 235');
    expect(formatNumber(1234.5, 'dec2').replace(/\s/g, ' ')).toBe('1 234,50');
    expect(formatNumber(0.256, 'percent')).toBe('25,6 %');
    expect(formatNumber(1234.5, 'eur').replace(/\s/g, ' ')).toBe('1 234,50 €');
  });

  it('utilise le format de la cellule', () => {
    const e = classeur({ A1: '0,5' });
    e.setStyle(zone(0, 0), { n: 'percent' });
    expect(e.display(0, 0)).toBe('50 %');
    e.setStyle(zone(0, 0), { n: 'general' });
    expect(e.display(0, 0)).toBe('0,5');
    expect(e.style(0, 0)).toEqual({});
  });
});

describe('styles', () => {
  it('ajoute, combine et retire des propriétés, sans laisser de style vide', () => {
    const e = classeur({});
    e.setStyle(zone(0, 0, 1, 1), { b: true });
    e.setStyle(zone(0, 0), { a: 'center', f: '#ffff00' });
    expect(e.style(0, 0)).toEqual({ b: true, a: 'center', f: '#ffff00' });
    expect(e.style(1, 1)).toEqual({ b: true });
    e.setStyle(zone(0, 0, 1, 1), { b: false });
    expect(e.style(0, 0)).toEqual({ a: 'center', f: '#ffff00' });
    expect(Object.keys(e.toDoc().styles)).toEqual(['A1']);
  });
});

describe('structure', () => {
  it('insère une ligne : les formules et les styles suivent', () => {
    const e = classeur({ A1: '1', A2: '2', A3: '=SOMME(A1:A2)' });
    e.setStyle(zone(1, 0), { b: true });
    e.insertRow(1);
    expect(e.raw(3, 0)).toBe('=SOMME(A1:A3)');
    expect(e.value(3, 0)).toBe(3);
    expect(e.style(2, 0)).toEqual({ b: true });
    expect(e.style(1, 0)).toEqual({});
    expect(e.rows).toBe(201);
  });

  it('supprime une ligne : les références se corrigent, les supprimées deviennent #REF!', () => {
    const e = classeur({ A1: '1', A2: '2', A3: '3', B1: '=A3', B2: '=A2' });
    e.setStyle(zone(1, 0), { b: true });
    e.deleteRow(1);
    expect(e.raw(0, 1)).toBe('=A2');
    expect(e.value(0, 1)).toBe(3);
    expect(e.display(1, 1)).toBe('');
    expect(e.style(1, 0)).toEqual({});
    const f = classeur({ A1: '1', A2: '2', B1: '=A2' });
    f.deleteRow(1);
    expect(f.display(0, 1)).toBe('#REF!');
  });

  it('insère et supprime des colonnes, largeurs comprises', () => {
    const e = classeur({ A1: '1', B1: '2', C1: '=A1+B1' }, { colWidths: { '1': 150, '2': 200 } });
    e.insertCol(1);
    expect(e.raw(0, 3)).toBe('=A1+C1');
    expect(e.colWidth(2)).toBe(150);
    expect(e.colWidth(1)).toBe(100);
    e.deleteCol(0);
    expect(e.value(0, 1)).toBe(2);
    expect(e.colWidth(1)).toBe(150);
  });

  it('ne dépasse pas les limites', () => {
    const e = classeur({}, { rows: 20000, cols: 200 });
    e.insertRow(0);
    e.insertCol(0);
    expect(e.rows).toBe(20000);
    expect(e.cols).toBe(200);
  });
});

describe('copier-coller', () => {
  it('copie contenu et styles en décalant les références relatives', () => {
    const e = classeur({ A1: '2', B1: '=A1*10', A2: '3' });
    e.setStyle(zone(0, 1), { b: true, n: 'eur' });
    const presse = e.copy(zone(0, 1));
    e.paste(presse, 1, 1);
    expect(e.raw(1, 1)).toBe('=A2*10');
    expect(e.value(1, 1)).toBe(30);
    expect(e.style(1, 1)).toEqual({ b: true, n: 'eur' });
    expect(e.raw(0, 1)).toBe('=A1*10');
  });

  it('remplace le style de la cellule de destination', () => {
    const e = classeur({ A1: 'x', B1: 'y' });
    e.setStyle(zone(1 - 1, 1), { b: true });
    e.paste(e.copy(zone(0, 0)), 0, 1);
    expect(e.raw(0, 1)).toBe('x');
    expect(e.style(0, 1)).toEqual({});
  });

  it('colle du texte venu d\'ailleurs et donne le texte affiché', () => {
    const e = classeur({});
    const couvert = e.pasteText('a\tb\r\n1\t2,5\r\n', 2, 1);
    expect(couvert).toEqual(zone(2, 1, 3, 2));
    expect(e.raw(3, 2)).toBe('2,5');
    expect(e.value(3, 2)).toBe(2.5);
    expect(e.toTsv(zone(2, 1, 3, 2))).toBe('a\tb\n1\t2,5');
  });
});

describe('statistiques et effacement', () => {
  it('additionne les nombres seulement', () => {
    const e = classeur({ A1: '1', A2: '2', A3: 'texte', A4: '=A1+A2' });
    expect(e.stats(zone(0, 0, 3, 0))).toEqual({ count: 3, sum: 6, average: 2 });
    expect(e.stats(zone(2, 0))).toEqual({ count: 0, sum: 0, average: 0 });
  });

  it('efface le contenu sans toucher au style', () => {
    const e = classeur({ A1: '1', B1: '2' });
    e.setStyle(zone(0, 0), { b: true });
    e.clear(zone(0, 0, 0, 1));
    expect(e.raw(0, 0)).toBe('');
    expect(e.style(0, 0)).toEqual({ b: true });
  });
});

describe('historique et enregistrement', () => {
  it('annule et rétablit les changements de contenu, de style et de structure', () => {
    const e = classeur({ A1: '1' });
    e.setRaw(0, 0, '2');
    e.commit();
    e.setStyle(zone(0, 0), { b: true });
    e.commit();
    e.insertRow(0);
    e.commit();
    expect(e.raw(1, 0)).toBe('2');
    e.undo();
    expect(e.raw(0, 0)).toBe('2');
    expect(e.rows).toBe(200);
    e.undo();
    expect(e.style(0, 0)).toEqual({});
    e.undo();
    expect(e.raw(0, 0)).toBe('1');
    expect(e.canUndo()).toBe(false);
    e.redo();
    e.redo();
    e.redo();
    expect(e.raw(1, 0)).toBe('2');
    expect(e.canRedo()).toBe(false);
  });

  it('oublie ce qu\'on pouvait rétablir quand on modifie après avoir annulé', () => {
    const e = classeur({ A1: '1' });
    e.setRaw(0, 0, '2');
    e.commit();
    e.undo();
    e.setRaw(0, 0, '3');
    e.commit();
    expect(e.canRedo()).toBe(false);
    expect(e.raw(0, 0)).toBe('3');
  });

  it('ne garde qu\'un point de retour quand rien n\'a changé', () => {
    const e = classeur({ A1: '1' });
    e.commit();
    e.commit();
    expect(e.canUndo()).toBe(false);
  });

  it('enregistre seulement ce qui a été saisi, et le relit à l\'identique', () => {
    const e = classeur({ A1: '1', B1: '=A1*2', C3: 'texte' }, { colWidths: { '0': 140 } });
    e.setStyle(zone(0, 0), { b: true, c: '#ff0000' });
    const doc = e.toDoc();
    expect(doc.cells).toEqual({ A1: '1', B1: '=A1*2', C3: 'texte' });
    expect(doc.styles).toEqual({ A1: { b: true, c: '#ff0000' } });
    expect(doc.colWidths).toEqual({ '0': 140 });
    const relu = new SheetEngine(doc);
    expect(relu.toDoc()).toEqual(doc);
    expect(relu.value(0, 1)).toBe(2);
  });

  it('ignore les données abîmées d\'un fichier', () => {
    const e = new SheetEngine({ rows: 10, cols: 5, cells: { A1: '1', 'nimporte quoi': 'x', B2: 5 as unknown as string }, styles: {}, colWidths: {} });
    expect(e.raw(0, 0)).toBe('1');
    expect(e.raw(1, 1)).toBe('');
  });
});
