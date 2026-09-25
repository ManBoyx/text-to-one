import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FormatError } from '../../../src/formats/errors';
import { slidesCodec } from '../../../src/formats/slides';
import { Historique, cloner, forme, nouvelleDiapo, présentationParDéfaut, zoneDeTexte, type SlidesDoc } from '../../../src/formats/slides/model';
import { exportPptx } from '../../../src/formats/slides/pptx';
import { nettoyerPrésentation, packSlides, unpackSlides } from '../../../src/formats/slides/ttp';
import { GIF_1PX, PNG_1PX } from '../sample-doc';

const exemple = (): SlidesDoc => ({
  slides: [
    { id: 'a1', background: '#ffffff', objects: [
      { id: 'o1', type: 'text', x: 80, y: 60, w: 800, h: 100, text: 'Bilan de l\'année & perspectives <2026>', style: { size: 48, bold: true, italic: false, underline: false, color: '#1d2330', align: 'center' } },
      { id: 'o2', type: 'shape', shape: 'ellipse', x: 100, y: 200, w: 300, h: 200, fill: '#2456d6', stroke: '#ff0000', strokeWidth: 3, text: 'Objectif', style: { size: 30, bold: false, italic: true, underline: true, color: '#ffffff', align: 'center' } },
      { id: 'o3', type: 'image', x: 500, y: 200, w: 200, h: 200, src: PNG_1PX, alt: 'un pixel' },
      { id: 'o4', type: 'image', x: 720, y: 200, w: 100, h: 100, src: PNG_1PX, alt: 'le même' },
    ] },
    { id: 'a2', background: '#1d2330', objects: [
      { id: 'o5', type: 'shape', shape: 'rect', x: 0, y: 0, w: 960, h: 40, fill: null, stroke: '#ffffff', strokeWidth: 2, text: '', style: { size: 20, bold: false, italic: false, underline: false, color: '#ffffff', align: 'left' } },
      { id: 'o6', type: 'image', x: 10, y: 10, w: 50, h: 50, src: GIF_1PX, alt: '' },
    ] },
  ],
});

describe('modèle', () => {
  it('propose trois mises en page et une présentation de départ', () => {
    expect(nouvelleDiapo('blank').objects).toEqual([]);
    expect(nouvelleDiapo('title').objects).toHaveLength(2);
    expect(nouvelleDiapo('content').objects).toHaveLength(2);
    expect(présentationParDéfaut().slides).toHaveLength(1);
  });

  it('clone une diapositive avec de nouveaux identifiants', () => {
    const original = nouvelleDiapo('content');
    const copie = cloner(original);
    expect(copie.id).not.toBe(original.id);
    expect(copie.objects.map((o) => o.id).some((id) => original.objects.some((o) => o.id === id))).toBe(false);
    expect(copie.objects.map((o) => o.type)).toEqual(original.objects.map((o) => o.type));
    const objet = zoneDeTexte(0, 0, 10, 10, 'x');
    expect(cloner(objet).id).not.toBe(objet.id);
    expect(forme('rect', 1, 2, 3, 4)).toMatchObject({ x: 1, y: 2, w: 3, h: 4, fill: '#2456d6' });
  });

  it("garde l'historique : annuler, rétablir, oublier le futur", () => {
    const h = new Historique<{ n: number }>({ n: 0 });
    expect(h.commit({ n: 1 })).toBe(true);
    expect(h.commit({ n: 1 })).toBe(false);
    h.commit({ n: 2 });
    expect(h.undo()).toEqual({ n: 1 });
    expect(h.undo()).toEqual({ n: 0 });
    expect(h.undo()).toBeNull();
    expect(h.redo()).toEqual({ n: 1 });
    h.commit({ n: 9 });
    expect(h.canRedo()).toBe(false);
    h.reset({ n: 5 });
    expect(h.canUndo()).toBe(false);
  });
});

describe('format .ttp', () => {
  it("relit exactement ce qu'il a enregistré, images comprises et rangées une seule fois", () => {
    const octets = packSlides(exemple());
    expect(unpackSlides(octets)).toEqual(exemple());
    const médias = Object.keys(unzipSync(octets)).filter((n) => n.startsWith('media/')).sort();
    expect(médias).toEqual(['media/image-1.png', 'media/image-2.gif']);
  });

  it('refuse ce qui n\'est pas une présentation, avec un message clair', () => {
    const manifeste = (m: object) => strToU8(JSON.stringify(m));
    expect(() => unpackSlides(new Uint8Array([1, 2, 3]))).toThrow(FormatError);
    expect(() => unpackSlides(zipSync({ 'slides.json': strToU8('{}') }))).toThrow(/pas une présentation Text to One/);
    expect(() => unpackSlides(zipSync({ 'manifest.json': manifeste({ format: 'text-to-one-slides', version: 99 }), 'slides.json': strToU8('{}') }))).toThrow(/version plus récente/);
    expect(() => unpackSlides(zipSync({ 'manifest.json': manifeste({ format: 'autre', version: 1 }), 'slides.json': strToU8('{}') }))).toThrow(FormatError);
    expect(() => unpackSlides(zipSync({ 'manifest.json': manifeste({ format: 'text-to-one-slides', version: 1 }), 'slides.json': strToU8('{cassé') }))).toThrow(FormatError);
  });

  it('retire les images dont le fichier manque et ne lit jamais hors de l\'archive', () => {
    const doc = { slides: [{ id: 'a', background: '#ffffff', objects: [
      { id: 'i1', type: 'image', x: 0, y: 0, w: 10, h: 10, src: 'media/absent.png', alt: '' },
      { id: 'i2', type: 'image', x: 0, y: 0, w: 10, h: 10, src: '../../etc/passwd', alt: '' },
      { id: 'i3', type: 'image', x: 0, y: 0, w: 10, h: 10, src: 'https://exemple.fr/pixel.png', alt: '' },
      { id: 'i4', type: 'text', x: 0, y: 0, w: 10, h: 10, text: 'reste', style: {} },
    ] }] };
    const octets = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'text-to-one-slides', version: 1 })), 'slides.json': strToU8(JSON.stringify(doc)) });
    const relu = unpackSlides(octets);
    expect(relu.slides[0].objects.map((o) => o.type)).toEqual(['text']);
  });

  it('nettoie une présentation abîmée ou hostile sans rien casser', () => {
    const doc = nettoyerPrésentation({
      slides: [
        { id: '../mauvais id', background: 'rouge', objects: [
          { type: 'text', x: 'loin', y: 1e9, w: -5, h: 20, text: 'x'.repeat(30000), style: { size: 99999, color: 'red', align: 'diagonale', bold: 'oui' } },
          { type: 'shape', shape: 'triangle', fill: '#12345g', stroke: '#AABBCC', strokeWidth: 999, text: 5 },
          { type: 'script', src: 'x' }, null, 42, { type: 'image', src: 5 },
        ] },
        null,
      ],
    });
    expect(doc.slides).toHaveLength(2);
    expect(doc.slides[0].id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(doc.slides[0].background).toBe('#ffffff');
    const [texte, formeBrute] = doc.slides[0].objects;
    expect(texte).toMatchObject({ type: 'text', x: 0, y: 5000, w: 4, h: 20 });
    expect((texte as { text: string }).text).toHaveLength(20000);
    expect((texte as { style: object }).style).toMatchObject({ size: 400, color: '#1d2330', align: 'left', bold: false });
    expect(formeBrute).toMatchObject({ type: 'shape', shape: 'rect', fill: null, stroke: '#AABBCC', strokeWidth: 40, text: '' });
    expect(doc.slides[0].objects).toHaveLength(2);
    expect(nettoyerPrésentation(null).slides).toHaveLength(1);
    expect(nettoyerPrésentation({ slides: [] }).slides[0].objects).toEqual([]);
  });
});

describe('export PowerPoint', () => {
  it('écrit une présentation 16/9 lisible : textes, formes, images, fonds, auteur', async () => {
    const fichiers = unzipSync(await exportPptx(exemple(), 'Bilan'));
    const noms = Object.keys(fichiers);
    expect(noms).toContain('ppt/slides/slide1.xml');
    expect(noms).toContain('ppt/slides/slide2.xml');
    expect(noms.filter((n) => n.startsWith('ppt/media/')).length).toBeGreaterThanOrEqual(1);
    const présentation = strFromU8(fichiers['ppt/presentation.xml']);
    expect(présentation).toContain('cx="9144000"');
    expect(présentation).toContain('cy="5143500"');
    const diapo1 = strFromU8(fichiers['ppt/slides/slide1.xml']);
    expect(diapo1).toContain('Bilan de l&apos;année &amp; perspectives &lt;2026&gt;');
    expect(diapo1).toContain('Objectif');
    expect(diapo1).toContain('prst="ellipse"');
    expect(diapo1).toContain('sz="3600"'); // 48 px = 36 pt
    expect(diapo1).toContain('<p:pic>');
    const diapo2 = strFromU8(fichiers['ppt/slides/slide2.xml']);
    expect(diapo2).toContain('1D2330');
    expect(strFromU8(fichiers['docProps/core.xml'])).toContain('Text to One');
    for (const [nom, contenu] of Object.entries(fichiers)) expect(strFromU8(contenu), nom).not.toMatch(/PptxGenJS/i);
  });

  it('exporte une présentation vide sans planter', async () => {
    await expect(exportPptx({ slides: [nouvelleDiapo('blank')] })).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe('codec des présentations', () => {
  it('écrit et relit le format propre, et écrit du PowerPoint', async () => {
    const octets = await slidesCodec.encode('ttp', exemple(), 'x');
    expect(await slidesCodec.decode('Expo.TTP', octets)).toEqual({ doc: exemple(), warnings: [], native: true });
    const pptx = await slidesCodec.encode('pptx', exemple(), 'x');
    expect(String.fromCharCode(pptx[0], pptx[1])).toBe('PK');
  });

  it("explique pourquoi un fichier ne s'ouvre pas", async () => {
    await expect(slidesCodec.decode('vieux.pptx', new Uint8Array([1]))).rejects.toThrow(/pas encore possible/);
    await expect(slidesCodec.decode('photo.png', new Uint8Array([1]))).rejects.toThrow(/photo\.png/);
    await expect(slidesCodec.encode('docx', exemple(), 'x')).rejects.toThrow(/pas disponible/);
  });
});
