import { describe, expect, it } from 'vitest';
import { FormatError } from '../../src/formats/errors';
import { decodeDocument, encodeDocument } from '../../src/formats';
import { sampleDoc } from './sample-doc';

const texte = (octets: Uint8Array): string => new TextDecoder().decode(octets);

describe('façade des formats', () => {
  it('écrit chaque format', async () => {
    expect(texte(await encodeDocument('txt', sampleDoc, 'Doc'))).toContain('Titre principal');
    expect(texte(await encodeDocument('md', sampleDoc, 'Doc'))).toContain('# Titre principal');
    expect(texte(await encodeDocument('html', sampleDoc, 'Doc'))).toContain('<title>Doc</title>');
    for (const type of ['tto', 'docx'] as const) {
      const octets = await encodeDocument(type, sampleDoc, 'Doc');
      expect(String.fromCharCode(octets[0], octets[1])).toBe('PK');
    }
  });

  it('relit un .tto sans perte, quelle que soit la casse de l\'extension', async () => {
    const octets = await encodeDocument('tto', sampleDoc, 'Doc');
    for (const nom of ['Rapport été 2025.tto', 'MAJUSCULES.TTO']) {
      const relu = await decodeDocument(nom, octets);
      expect(relu).toEqual({ doc: sampleDoc, warnings: [], source: 'tto' });
    }
  });

  it('relit un .docx', async () => {
    const relu = await decodeDocument('lettre.docx', await encodeDocument('docx', sampleDoc, 'Doc'));
    expect(relu.source).toBe('docx');
    expect(relu.doc.type).toBe('doc');
  });

  it('explique pourquoi un ancien .doc ou un autre type ne s\'ouvre pas', async () => {
    await expect(decodeDocument('vieux.doc', new Uint8Array([1]))).rejects.toThrow(/anciens fichiers \.doc/);
    await expect(decodeDocument('photo.png', new Uint8Array([1]))).rejects.toThrow(/photo\.png/);
    await expect(decodeDocument('sans-extension', new Uint8Array([1]))).rejects.toBeInstanceOf(FormatError);
  });

  it("n'ouvre pas un faux .tto ni un faux .docx", async () => {
    await expect(decodeDocument('faux.tto', new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(FormatError);
    await expect(decodeDocument('faux.docx', new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(FormatError);
  });
});
