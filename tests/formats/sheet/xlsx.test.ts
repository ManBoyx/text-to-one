import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FormatError } from '../../../src/formats/errors';
import { sheetCodec } from '../../../src/formats/sheet';
import type { SheetDoc } from '../../../src/formats/sheet/model';
import { exportXlsx, importXlsx } from '../../../src/formats/sheet/xlsx';

const exemple = (): SheetDoc => ({
  rows: 200,
  cols: 26,
  cells: { A1: 'Produit', B1: 'Prix', C1: 'Total', A2: 'Stylo <bleu> & "rouge"', B2: '1,5', C2: '=B2*10', A3: 'Cahier', B3: '2,25', C3: '=B3*10', B4: '=SOMME(B2:B3)', C4: '=SI(B4>3;"cher";"bon marché")', A5: '=1/0' },
  styles: { A1: { b: true, f: '#ffff00', a: 'center' }, B2: { n: 'eur' }, B3: { n: 'percent', i: true, c: '#ff0000' }, C2: { n: 'dec2', a: 'right' } },
  colWidths: { '0': 180, '2': 120 },
});

const ENTÊTE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const classeurExcel = (extra: Record<string, string> = {}, feuille = '', stylesXml = ''): Uint8Array =>
  zipSync(
    Object.fromEntries(
      Object.entries({
        'xl/workbook.xml': `${ENTÊTE}<workbook ${NS}><sheets><sheet name="Données" sheetId="1" r:id="rId3"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': `${ENTÊTE}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
        'xl/worksheets/sheet1.xml': `${ENTÊTE}<worksheet ${NS}>${feuille}</worksheet>`,
        ...(stylesXml ? { 'xl/styles.xml': `${ENTÊTE}<styleSheet ${NS}>${stylesXml}</styleSheet>` } : {}),
        ...extra,
      }).map(([n, c]) => [n, strToU8(c)]),
    ),
  );

describe('export Excel', () => {
  const fichiers = unzipSync(exportXlsx(exemple()));
  const feuille = strFromU8(fichiers['xl/worksheets/sheet1.xml']);

  it('écrit une archive Excel complète', () => {
    for (const nom of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) expect(fichiers[nom], nom).toBeDefined();
    expect(strFromU8(fichiers['xl/workbook.xml'])).toContain('name="Feuille 1"');
  });

  it("écrit les formules en anglais, avec leur résultat déjà calculé", () => {
    expect(feuille).toContain('<f>B2*10</f><v>15</v>');
    expect(feuille).toContain('<f>SUM(B2:B3)</f><v>3.75</v>');
    expect(feuille).toMatch(/t="str"><f>IF\(B4&gt;3,&quot;cher&quot;,&quot;bon marché&quot;\)<\/f><v>cher<\/v>|t="str"><f>IF\(B4&gt;3,"cher","bon marché"\)<\/f><v>cher<\/v>/);
    expect(feuille).toContain('t="e"><f>1/0</f><v>#DIV/0!</v>');
  });

  it('écrit les nombres comme des nombres et protège le texte', () => {
    expect(feuille).toContain('<c r="B2" s="');
    expect(feuille).toMatch(/<c r="B3"[^>]*><v>2.25<\/v>/);
    expect(feuille).toContain('Stylo &lt;bleu&gt; &amp; &quot;rouge&quot;');
    expect(feuille).toContain('<col min="1" max="1" width="25" customWidth="1"/>');
  });

  it('écrit les styles', () => {
    const styles = strFromU8(fichiers['xl/styles.xml']);
    expect(styles).toContain('<b/>');
    expect(styles).toContain('<i/>');
    expect(styles).toContain('rgb="FFFFFF00"');
    expect(styles).toContain('rgb="FFFF0000"');
    expect(styles).toContain('horizontal="center"');
    expect(styles).toContain('numFmtId="10"');
    expect(styles).toContain('numFmtId="164"');
    expect(styles).toContain('€');
  });
});

describe('import Excel', () => {
  it("retrouve l'essentiel d'un classeur exporté puis relu", () => {
    const { doc, warnings } = importXlsx(exportXlsx(exemple()));
    expect(warnings).toEqual([]);
    expect(doc.cells).toEqual(exemple().cells);
    expect(doc.styles).toEqual(exemple().styles);
    expect(doc.colWidths).toEqual(exemple().colWidths);
  });

  it('lit un classeur écrit comme Excel : chaînes partagées, formules partagées, booléens, styles', () => {
    const octets = classeurExcel(
      { 'xl/sharedStrings.xml': `${ENTÊTE}<sst ${NS}><si><t>Nom</t></si><si><r><t>Gras </t></r><r><t>et suite</t></r></si></sst>` },
      '<cols><col min="1" max="2" width="20" customWidth="1"/></cols><sheetData>' +
        '<row r="1"><c r="A1" t="s" s="1"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" s="2"><v>0.256</v></c><c r="B2" t="b"><v>1</v></c><c r="C2"><f>_xlfn.CONCAT(A1,"x")</f><v>0</v></c></row>' +
        '<row r="3"><c r="A3"><f t="shared" ref="A3:A4" si="0">SUM(A1:A2)</f><v>1</v></c></row>' +
        '<row r="4"><c r="A4"><f t="shared" si="0"/><v>2</v></c></row>' +
        '</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>',
      '<fonts count="2"><font><sz val="11"/></font><font><b/><color rgb="FFC0392B"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill></fills>' +
        '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0"/><xf numFmtId="0" fontId="1" fillId="2"><alignment horizontal="center"/></xf><xf numFmtId="9" fontId="0" fillId="0"/></cellXfs>',
    );
    const { doc, warnings } = importXlsx(octets);
    expect(doc.cells).toEqual({ A1: 'Nom', B1: 'Gras et suite', A2: '0,256', B2: '=VRAI()', C2: '=CONCAT(A1;"x")', A3: '=SOMME(A1:A2)', A4: '=SOMME(A2:A3)' });
    expect(doc.styles).toEqual({ A1: { b: true, c: '#c0392b', f: '#ffff00', a: 'center' }, A2: { n: 'percent' } });
    expect(doc.colWidths).toEqual({ '0': 145, '1': 145 });
    expect(warnings).toEqual(['Les cellules fusionnées ne sont pas reprises.']);
  });

  it('signale plusieurs feuilles, les graphiques et ce qui dépasse les limites', () => {
    const octets = zipSync({
      'xl/workbook.xml': strToU8(`${ENTÊTE}<workbook ${NS}><sheets><sheet name="A" sheetId="1" r:id="rId1"/><sheet name="B" sheetId="2" r:id="rId2"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8(`${ENTÊTE}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="/xl/worksheets/sheet1.xml"/></Relationships>`),
      'xl/worksheets/sheet1.xml': strToU8(`${ENTÊTE}<worksheet ${NS}><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="ZZZ1"><v>2</v></c></row><row r="99999"><c r="A99999"><v>3</v></c></row></sheetData></worksheet>`),
      'xl/charts/chart1.xml': strToU8('<chart/>'),
    });
    const { doc, warnings } = importXlsx(octets);
    expect(doc.cells).toEqual({ A1: '1' });
    expect(warnings).toEqual(['Seule la première feuille du classeur est reprise.', 'Les graphiques et les images ne sont pas repris.', 'Le classeur est trop grand : seuls 20000 lignes et 200 colonnes sont repris.']);
  });

  it("refuse ce qui n'est pas un classeur Excel, sans planter", () => {
    expect(() => importXlsx(new Uint8Array([1, 2, 3]))).toThrow(FormatError);
    expect(() => importXlsx(zipSync({ 'texte.txt': strToU8('x') }))).toThrow(/pas un classeur Excel valide/);
    expect(() => importXlsx(classeurExcel({ 'xl/worksheets/sheet1.xml': '<worksheet><sheetData>' }))).toThrow(/endommagé/);
    expect(() => importXlsx(zipSync({ 'xl/workbook.xml': strToU8(`${ENTÊTE}<workbook ${NS}><sheets><sheet name="A" sheetId="1" r:id="rId9"/></sheets></workbook>`) }))).toThrow(FormatError);
  });
});

describe('codec du tableur', () => {
  it('écrit et relit chaque format', async () => {
    const doc = exemple();
    const tts = await sheetCodec.encode('tts', doc, 'x');
    expect(await sheetCodec.decode('Budget.tts', tts)).toEqual({ doc, warnings: [], native: true });
    const xlsx = await sheetCodec.decode('Budget.xlsx', await sheetCodec.encode('xlsx', doc, 'x'));
    expect(xlsx.native).toBe(false);
    expect(xlsx.doc.cells).toEqual(doc.cells);
    const csv = await sheetCodec.decode('Budget.CSV', await sheetCodec.encode('csv', { ...doc, cells: { A1: 'a', B1: '2,5' } }, 'x'));
    expect(csv.doc.cells).toEqual({ A1: 'a', B1: '2,5' });
    expect(csv.native).toBe(false);
  });

  it("explique pourquoi un fichier ne s'ouvre pas", async () => {
    await expect(sheetCodec.decode('vieux.xls', new Uint8Array([1]))).rejects.toThrow(/anciens fichiers \.xls/);
    await expect(sheetCodec.decode('photo.png', new Uint8Array([1]))).rejects.toThrow(/photo\.png/);
    await expect(sheetCodec.encode('docx', exemple(), 'x')).rejects.toThrow(/pas disponible/);
  });
});
