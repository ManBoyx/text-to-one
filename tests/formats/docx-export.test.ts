import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { couleurEnHex, demiPoints, exportDocx } from '../../src/formats/docx-export';
import { sampleDoc } from './sample-doc';

async function lire(doc = sampleDoc) {
  const fichiers = unzipSync(await exportDocx(doc));
  return { fichiers, xml: strFromU8(fichiers['word/document.xml']), numérotation: strFromU8(fichiers['word/numbering.xml']) };
}

describe('export Word', () => {
  it('produit une archive Word complète, signée « Text to One »', async () => {
    const { fichiers } = await lire();
    expect(fichiers['[Content_Types].xml']).toBeDefined();
    expect(strFromU8(fichiers['docProps/core.xml'])).toContain('Text to One');
    expect(strFromU8(fichiers['docProps/core.xml'])).not.toContain('Un-named');
  });

  it('écrit titres, alignement, interligne et mise en forme du texte', async () => {
    const { xml } = await lire();
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toMatch(/<w:spacing w:line="360"/);
    expect(xml).toMatch(/<w:b\b/);
    expect(xml).toMatch(/<w:i\b/);
    expect(xml).toMatch(/<w:u\b/);
    expect(xml).toMatch(/<w:strike\b/);
    expect(xml).toContain('w:val="FF0000"');
    expect(xml).toContain('w:fill="FFFF00"');
    expect(xml).toContain('<w:hyperlink');
  });

  it('écrit les listes avec deux numérotations indépendantes et des cases à cocher', async () => {
    const { xml, numérotation } = await lire();
    const texte = xml.replace(/<[^>]+>/g, ''); // le texte lu par une personne, sans le balisage
    expect(texte).toContain('☑ fait');
    expect(texte).toContain('☐ à faire');
    const identifiants = [...xml.matchAll(/<w:numId w:val="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(identifiants).size).toBeGreaterThanOrEqual(3); // puces, sous-puces, numérotée
    expect(numérotation).toContain('w:val="decimal"');
    expect(numérotation).toContain('•');
  });

  it('écrit le tableau avec ses fusions, sa ligne d\'en-tête et ses trois colonnes', async () => {
    const { xml } = await lire();
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('<w:gridSpan w:val="2"/>');
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(xml).toContain('<w:tblHeader');
    expect([...xml.matchAll(/<w:gridCol /g)]).toHaveLength(3);
  });

  it("écrit le saut de page et l'image", async () => {
    const { xml, fichiers } = await lire();
    expect(xml).toContain('<w:br w:type="page"/>');
    expect(xml).toContain('<w:drawing>');
    expect(Object.keys(fichiers).filter((n) => /^word\/media\/.+\.png$/.test(n))).toHaveLength(1);
  });

  it('ne plante pas sur un document vide ni sur une image de format inconnu', async () => {
    await expect(exportDocx({ type: 'doc', content: [{ type: 'paragraph' }] })).resolves.toBeInstanceOf(Uint8Array);
    await expect(exportDocx({ type: 'doc' })).resolves.toBeInstanceOf(Uint8Array);
    const { xml } = await lire({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'data:image/webp;base64,AAAA' } }] }] });
    expect(xml).toContain('[image non prise en charge]');
  });

  it("convertit couleurs et tailles", () => {
    expect(couleurEnHex('#f00')).toBe('FF0000');
    expect(couleurEnHex('#00ff7f')).toBe('00FF7F');
    expect(couleurEnHex('rgb(255, 0, 0)')).toBe('FF0000');
    expect(couleurEnHex('rouge')).toBeUndefined();
    expect(couleurEnHex(undefined)).toBeUndefined();
    expect(demiPoints('12pt')).toBe(24);
    expect(demiPoints('16px')).toBe(24);
    expect(demiPoints('10.5pt')).toBe(21);
    expect(demiPoints('grand')).toBeUndefined();
  });
});
