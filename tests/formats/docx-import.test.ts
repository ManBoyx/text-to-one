import type { JSONContent } from '@tiptap/core';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FormatError } from '../../src/formats/errors';
import { exportDocx } from '../../src/formats/docx-export';
import { importDocx } from '../../src/formats/docx-import';
import { PNG_1PX, sampleDoc } from './sample-doc';

const ESPACES =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const ENTÊTE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const p = (contenu: string, propriétés = ''): string => `<w:p>${propriétés ? `<w:pPr>${propriétés}</w:pPr>` : ''}${contenu}</w:p>`;
const r = (texte: string, propriétés = ''): string =>
  `<w:r>${propriétés ? `<w:rPr>${propriétés}</w:rPr>` : ''}<w:t xml:space="preserve">${texte}</w:t></w:r>`;

function docx(corps: string, extra: Record<string, string | Uint8Array> = {}): Uint8Array {
  const fichiers: Record<string, Uint8Array> = {
    'word/document.xml': strToU8(`${ENTÊTE}<w:document ${ESPACES}><w:body>${corps}</w:body></w:document>`),
  };
  for (const [nom, contenu] of Object.entries(extra)) fichiers[nom] = typeof contenu === 'string' ? strToU8(contenu) : contenu;
  return zipSync(fichiers);
}

const STYLES = `${ENTÊTE}<w:styles ${ESPACES}>
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="MonTitre"><w:name w:val="Mon titre"/><w:basedOn w:val="Titre1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Titre3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`;

const NUMÉROTATION = `${ENTÊTE}<w:numbering ${ESPACES}>
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const RELATIONS = (lignes: string): string =>
  `${ENTÊTE}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${lignes}</Relationships>`;

const num = (numId: number, niveau: number): string => `<w:numPr><w:ilvl w:val="${niveau}"/><w:numId w:val="${numId}"/></w:numPr>`;

/** Aplatit un document en une liste de noeuds pour les retrouver facilement. */
function tous(noeud: JSONContent): JSONContent[] {
  return [noeud, ...(noeud.content ?? []).flatMap(tous)];
}
const marquesDe = (doc: JSONContent, texte: string) => tous(doc).find((n) => n.type === 'text' && n.text === texte)?.marks ?? [];
const typesDe = (marques: JSONContent['marks']) => (marques ?? []).map((m) => m.type).sort();

describe('import Word', () => {
  it('reconnaît les titres par leur style, même personnalisé, et ignore la police et la taille par défaut', () => {
    const { doc } = importDocx(
      docx(
        p(r('Grand', '<w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/>'), '<w:pStyle w:val="Titre1"/>') +
          p(r('Perso'), '<w:pStyle w:val="MonTitre"/>') +
          p(r('Petit'), '<w:pStyle w:val="Titre3"/>') +
          p(r('Texte', '<w:sz w:val="28"/><w:rFonts w:ascii="Georgia"/>')),
        { 'word/styles.xml': STYLES },
      ),
    );
    expect(doc.content?.map((n) => [n.type, n.attrs?.level])).toEqual([['heading', 1], ['heading', 1], ['heading', 3], ['paragraph', undefined]]);
    expect(marquesDe(doc, 'Grand')).toEqual([]);
    expect(marquesDe(doc, 'Texte')).toEqual([{ type: 'textStyle', attrs: { fontFamily: 'Georgia', fontSize: '14pt' } }]);
  });

  it('lit la mise en forme du texte', () => {
    const { doc } = importDocx(
      docx(
        p(
          r('a', '<w:b/><w:i/><w:u w:val="single"/><w:strike/>') +
            r('b', '<w:color w:val="ff0000"/><w:highlight w:val="yellow"/>') +
            r('c', '<w:vertAlign w:val="superscript"/>') +
            r('d', '<w:vertAlign w:val="subscript"/>') +
            r('e', '<w:b w:val="0"/><w:u w:val="none"/><w:color w:val="auto"/>'),
        ),
      ),
    );
    expect(typesDe(marquesDe(doc, 'a'))).toEqual(['bold', 'italic', 'strike', 'underline']);
    expect(marquesDe(doc, 'b')).toEqual(
      expect.arrayContaining([{ type: 'textStyle', attrs: { color: '#FF0000' } }, { type: 'highlight', attrs: { color: '#FFFF00' } }]),
    );
    expect(typesDe(marquesDe(doc, 'c'))).toEqual(['superscript']);
    expect(typesDe(marquesDe(doc, 'd'))).toEqual(['subscript']);
    expect(marquesDe(doc, 'e')).toEqual([]);
  });

  it("lit l'alignement, l'interligne et fusionne le texte de même style", () => {
    const { doc } = importDocx(
      docx(
        p(r('Centré ') + r('ici'), '<w:jc w:val="center"/><w:spacing w:line="360" w:lineRule="auto"/>') +
          p(r('Droite'), '<w:jc w:val="right"/>') +
          p(r('Justifié'), '<w:jc w:val="both"/><w:spacing w:line="240" w:lineRule="auto"/>') +
          p(r('Exact'), '<w:spacing w:line="400" w:lineRule="exact"/>'),
      ),
    );
    const [centré, droite, justifié, exact] = doc.content ?? [];
    expect(centré.attrs).toEqual({ textAlign: 'center', lineHeight: '1.5' });
    expect(centré.content).toEqual([{ type: 'text', text: 'Centré ici' }]);
    expect(droite.attrs).toEqual({ textAlign: 'right' });
    expect(justifié.attrs).toEqual({ textAlign: 'justify' });
    expect(exact.attrs).toBeUndefined();
  });

  it('lit les liens externes et refuse les adresses dangereuses', () => {
    const relations = RELATIONS(
      '<Relationship Id="rId1" Type="x/hyperlink" Target="https://exemple.fr/page" TargetMode="External"/>' +
        '<Relationship Id="rId2" Type="x/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>',
    );
    const { doc } = importDocx(
      docx(
        p(
          `<w:hyperlink r:id="rId1">${r('sûr')}</w:hyperlink><w:hyperlink r:id="rId2">${r('piège')}</w:hyperlink>` +
            `<w:hyperlink w:anchor="titre">${r('interne')}</w:hyperlink>`,
        ),
        { 'word/_rels/document.xml.rels': relations },
      ),
    );
    expect(marquesDe(doc, 'sûr')).toEqual([{ type: 'link', attrs: { href: 'https://exemple.fr/page' } }]);
    expect(marquesDe(doc, 'piège')).toEqual([]);
    expect(marquesDe(doc, 'interne')).toEqual([]);
  });

  it('reconstruit les listes à puces, numérotées et imbriquées', () => {
    const { doc } = importDocx(
      docx(
        p(r('a'), num(1, 0)) + p(r('a1'), num(1, 1)) + p(r('b'), num(1, 0)) + p(r('entre deux')) + p(r('un'), num(2, 0)) + p(r('deux'), num(2, 0)),
        { 'word/numbering.xml': NUMÉROTATION },
      ),
    );
    const [puces, entre, numérotée] = doc.content ?? [];
    expect(puces.type).toBe('bulletList');
    expect(puces.content?.map((i) => i.content?.[0]?.content?.[0]?.text)).toEqual(['a', 'b']);
    expect(puces.content?.[0]?.content?.[1]?.type).toBe('bulletList');
    expect(puces.content?.[0]?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('a1');
    expect(entre.type).toBe('paragraph');
    expect(numérotée.type).toBe('orderedList');
    expect(numérotée.content).toHaveLength(2);
  });

  it('reconstruit les listes définies par le style de Word (« Liste à puces », « Liste numérotée »)', () => {
    const styles = `${ENTÊTE}<w:styles ${ESPACES}>
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
      <w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="MaListe"><w:name w:val="Ma liste"/><w:basedOn w:val="ListBullet"/></w:style>
      <w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr></w:style>
    </w:styles>`;
    const { doc } = importDocx(
      docx(
        p(r('a'), '<w:pStyle w:val="ListBullet"/>') +
          p(r('b'), '<w:pStyle w:val="MaListe"/>') +
          p(r('un'), '<w:pStyle w:val="ListNumber"/>') +
          p(r('hors liste'), '<w:pStyle w:val="ListBullet"/><w:numPr><w:numId w:val="0"/></w:numPr>'),
        { 'word/styles.xml': styles, 'word/numbering.xml': NUMÉROTATION },
      ),
    );
    expect(doc.content?.map((n) => n.type)).toEqual(['bulletList', 'orderedList', 'paragraph']);
    expect(doc.content?.[0]?.content).toHaveLength(2);
  });

  it('lit les tableaux, leurs fusions et leur ligne d\'en-tête', () => {
    const cellule = (texte: string, propriétés = '') => `<w:tc><w:tcPr>${propriétés}</w:tcPr>${p(r(texte))}</w:tc>`;
    const table =
      '<w:tbl>' +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cellule('T', '<w:gridSpan w:val="2"/>')}${cellule('U')}</w:tr>` +
      `<w:tr>${cellule('A', '<w:vMerge w:val="restart"/>')}${cellule('B')}${cellule('C')}</w:tr>` +
      `<w:tr>${cellule('', '<w:vMerge/>')}${cellule('D')}${cellule('E')}</w:tr>` +
      '</w:tbl>';
    const { doc } = importDocx(docx(table));
    const lignes = doc.content?.[0]?.content ?? [];
    expect(lignes).toHaveLength(3);
    expect(lignes[0].content?.map((c) => [c.type, c.attrs?.colspan])).toEqual([['tableHeader', 2], ['tableHeader', 1]]);
    expect(lignes[1].content?.[0]?.attrs).toEqual({ colspan: 1, rowspan: 2 });
    expect(lignes[2].content).toHaveLength(2);
  });

  it('coupe le paragraphe à un saut de page', () => {
    const { doc } = importDocx(docx(p(r('avant') + '<w:r><w:br w:type="page"/></w:r>' + r('après')) + p(r('suite'), '<w:pageBreakBefore/>')));
    expect(doc.content?.map((n) => n.type)).toEqual(['paragraph', 'pageBreak', 'paragraph', 'pageBreak', 'paragraph']);
  });

  it('lit une image intégrée avec sa taille, et signale celles qu\'il ne sait pas lire', () => {
    const dessin = (rid: string) =>
      `<w:r><w:drawing><wp:inline><wp:extent cx="381000" cy="190500"/><wp:docPr id="1" name="Image 1" descr="Un pixel"/>` +
      `<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const relations = RELATIONS(
      '<Relationship Id="rId1" Type="x/image" Target="media/image1.png"/><Relationship Id="rId2" Type="x/image" Target="media/image2.emf"/>',
    );
    const png = Uint8Array.from(atob(PNG_1PX.split(',')[1]), (c) => c.charCodeAt(0));
    const { doc, warnings } = importDocx(
      docx(p(r('Voici ') + dessin('rId1') + dessin('rId2')), {
        'word/_rels/document.xml.rels': relations,
        'word/media/image1.png': png,
        'word/media/image2.emf': new Uint8Array([1, 2, 3]),
      }),
    );
    const images = tous(doc).filter((n) => n.type === 'image');
    expect(images).toHaveLength(1);
    expect(images[0].attrs).toEqual({ src: PNG_1PX, alt: 'Un pixel', width: 40, height: 20 });
    expect(warnings).toEqual(["1 image n'a pas pu être reprise (format non pris en charge)."]);
  });

  it('garde le texte inséré et ignore le texte supprimé du suivi des modifications', () => {
    const { doc } = importDocx(docx(p(r('reste ') + `<w:ins w:id="1">${r('ajouté')}</w:ins><w:del w:id="2"><w:r><w:delText>retiré</w:delText></w:r></w:del>`)));
    expect(JSON.stringify(doc)).toContain('reste ajouté');
    expect(JSON.stringify(doc)).not.toContain('retiré');
  });

  it('signale ce qui ne sera pas repris', () => {
    const entête = `${ENTÊTE}<w:hdr ${ESPACES}>${p(r('Mon entête'))}</w:hdr>`;
    const notes = `${ENTÊTE}<w:footnotes ${ESPACES}><w:footnote w:id="2">${p(r('Ma note'))}</w:footnote></w:footnotes>`;
    const { warnings } = importDocx(docx(p(r('x')), { 'word/header1.xml': entête, 'word/footnotes.xml': notes }));
    expect(warnings).toEqual(['Les en-têtes et pieds de page du document ne sont pas repris.', 'Les notes de bas de page ne sont pas reprises.']);
  });

  it("refuse ce qui n'est pas un document Word, sans planter", () => {
    expect(() => importDocx(new Uint8Array([1, 2, 3]))).toThrow(FormatError);
    expect(() => importDocx(new Uint8Array())).toThrow(FormatError);
    expect(() => importDocx(zipSync({ 'texte.txt': strToU8('bonjour') }))).toThrow(/pas un document Word valide/);
    expect(() => importDocx(zipSync({ 'word/document.xml': strToU8('<w:document><w:body>') }))).toThrow(/endommagé/);
    expect(() => importDocx(zipSync({ 'word/document.xml': strToU8(`<w:document ${ESPACES}/>`) }))).toThrow(FormatError);
  });

  it("garde l'essentiel d'un document exporté puis relu", async () => {
    const { doc, warnings } = importDocx(await exportDocx(sampleDoc));
    expect(warnings).toEqual([]);
    const tout = tous(doc);
    expect(doc.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
    expect(doc.content?.[1]?.attrs).toEqual({ textAlign: 'center', lineHeight: '1.5' });
    expect(typesDe(marquesDe(doc, 'gras'))).toEqual(['bold']);
    expect(typesDe(marquesDe(doc, 'souligné'))).toEqual(['underline']);
    expect(marquesDe(doc, 'rouge')).toEqual([{ type: 'textStyle', attrs: { color: '#FF0000' } }]);
    expect(marquesDe(doc, 'lien')).toEqual(expect.arrayContaining([{ type: 'link', attrs: { href: 'https://exemple.fr' } }]));
    expect(tout.filter((n) => n.type === 'bulletList')).toHaveLength(2);
    expect(tout.filter((n) => n.type === 'orderedList')).toHaveLength(1);
    const table = tout.find((n) => n.type === 'table');
    expect(table?.content).toHaveLength(3);
    expect(table?.content?.[0]?.content?.[0]?.attrs?.colspan).toBe(2);
    expect(table?.content?.[1]?.content?.[0]?.attrs?.rowspan).toBe(2);
    expect(tout.some((n) => n.type === 'pageBreak')).toBe(true);
    for (const texte of ['Une citation', '☑ fait', 'ligne 1']) expect(JSON.stringify(doc)).toContain(texte);
    expect(tout.find((n) => n.type === 'image')?.attrs).toMatchObject({ src: PNG_1PX, width: 40, height: 40 });
  });
});
