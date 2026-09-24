import type { JSONContent } from '@tiptap/core';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FormatError } from '../../src/formats/errors';
import { packTto, unpackTto } from '../../src/formats/tto';
import { GIF_1PX, PNG_1PX, sampleDoc } from './sample-doc';

const image = (src: string): JSONContent => ({ type: 'image', attrs: { src, alt: null } });
const docAvec = (...sources: string[]): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph', content: sources.map(image) }] });
const archive = (fichiers: Record<string, string>): Uint8Array =>
  zipSync(Object.fromEntries(Object.entries(fichiers).map(([nom, contenu]) => [nom, strToU8(contenu)])));
const manifeste = (version: number): string => JSON.stringify({ format: 'text-to-one', version });
const docVide = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });

describe('format .tto', () => {
  it("relit exactement ce qu'il a enregistré", () => {
    expect(unpackTto(packTto(sampleDoc))).toEqual(sampleDoc);
  });

  it('range chaque image une seule fois dans media/', () => {
    const fichiers = unzipSync(packTto(docAvec(PNG_1PX, PNG_1PX, GIF_1PX)));
    const médias = Object.keys(fichiers).filter((nom) => nom.startsWith('media/')).sort();
    expect(médias).toEqual(['media/image-1.png', 'media/image-2.gif']);
    expect(new TextDecoder().decode(fichiers['document.json'])).not.toContain('data:image');
  });

  it("refuse ce qui n'est pas une archive", () => {
    expect(() => unpackTto(new Uint8Array([1, 2, 3, 4]))).toThrow(FormatError);
    expect(() => unpackTto(new Uint8Array())).toThrow(/pas un document Text to One/);
  });

  it('refuse une archive sans manifeste ou sans document', () => {
    expect(() => unpackTto(archive({ 'document.json': docVide }))).toThrow(FormatError);
    expect(() => unpackTto(archive({ 'manifest.json': manifeste(1) }))).toThrow(FormatError);
  });

  it("refuse un document créé par une version plus récente, avec un message clair", () => {
    expect(() => unpackTto(archive({ 'manifest.json': manifeste(99), 'document.json': docVide }))).toThrow(/version plus récente/);
  });

  it('refuse un contenu illisible', () => {
    expect(() => unpackTto(archive({ 'manifest.json': manifeste(1), 'document.json': '{cassé' }))).toThrow(FormatError);
    expect(() => unpackTto(archive({ 'manifest.json': manifeste(1), 'document.json': '{"type":"autre"}' }))).toThrow(FormatError);
    expect(() => unpackTto(archive({ 'manifest.json': JSON.stringify({ format: 'autre', version: 1 }), 'document.json': docVide }))).toThrow(FormatError);
  });

  it('retire les images dont le fichier manque, sans planter', () => {
    const doc = JSON.stringify(docAvec('media/image-9.png'));
    const relu = unpackTto(archive({ 'manifest.json': manifeste(1), 'document.json': doc }));
    expect(relu.content?.[0]?.content).toEqual([]);
  });

  it("ne lit jamais en dehors de l'archive", () => {
    const doc = JSON.stringify(docAvec('media/../../etc/passwd', '/etc/passwd', 'C:\\Windows\\win.ini'));
    const relu = unpackTto(archive({ 'manifest.json': manifeste(1), 'document.json': doc }));
    const sources = (relu.content?.[0]?.content ?? []).map((n) => n.attrs?.src);
    expect(sources).toEqual(['/etc/passwd', 'C:\\Windows\\win.ini']);
    for (const s of sources) expect(String(s).startsWith('data:')).toBe(false);
  });
});
