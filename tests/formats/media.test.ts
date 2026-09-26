import type { JSONContent } from '@tiptap/core';
import { generateHTML, generateJSON } from '@tiptap/html';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../src/formats/docx-export';
import { toHtmlDocument, toMarkdown, toPlainText } from '../../src/formats/export-text';
import { SheetEngine } from '../../src/formats/sheet/engine';
import { MAX_MEDIA } from '../../src/formats/sheet/model';
import { packSheet, unpackSheet } from '../../src/formats/sheet/tts';
import { Historique, cloner, type SlidesDoc } from '../../src/formats/slides/model';
import { exportPptx } from '../../src/formats/slides/pptx';
import { nettoyerPrésentation, packSlides, unpackSlides } from '../../src/formats/slides/ttp';
import { packTto, unpackTto } from '../../src/formats/tto';
import { adresseMédiaValide, depuisJsonCompact, enJsonCompact, typeDeMédia } from '../../src/shared/media';
import { buildExtensions } from '../../src/shared/schema';

const enAdresse = (octets: number[], mime: string): string => `data:${mime};base64,${Buffer.from(octets).toString('base64')}`;
const MP3 = enAdresse([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4, 5, 6], 'audio/mpeg');
const MP4 = enAdresse([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 9, 8, 7], 'video/mp4');
const GROS = enAdresse(Array.from({ length: 300_000 }, (_, i) => i % 251), 'audio/mpeg');

const média = (src: string, title = 'Mon titre'): JSONContent => ({ type: 'media', attrs: { src, title } });
const doc = (...blocs: JSONContent[]): JSONContent => ({ type: 'doc', content: blocs });

describe('sons et vidéos : reconnaissance', () => {
  it('reconnaît les formats courants par le type annoncé puis par le nom', () => {
    expect(typeDeMédia('chanson.mp3')).toEqual({ mime: 'audio/mpeg', genre: 'audio' });
    expect(typeDeMédia('film.MP4')).toEqual({ mime: 'video/mp4', genre: 'video' });
    expect(typeDeMédia('x.wav', 'audio/x-wav')).toEqual({ mime: 'audio/wav', genre: 'audio' });
    expect(typeDeMédia('piste.mp4', 'audio/mp4')).toEqual({ mime: 'audio/mp4', genre: 'audio' }); // du son dans un conteneur mp4
    expect(typeDeMédia('virus.exe')).toBeNull();
    expect(typeDeMédia('page.html', 'text/html')).toBeNull();
  });

  it("n'accepte comme adresse que du son ou de la vidéo en base64", () => {
    expect(adresseMédiaValide(MP3)).toBe(true);
    expect(adresseMédiaValide(MP4)).toBe(true);
    expect(adresseMédiaValide('data:text/html;base64,PGgxPg==')).toBe(false);
    expect(adresseMédiaValide('data:image/png;base64,AAAA')).toBe(false);
    expect(adresseMédiaValide('https://exemple.fr/a.mp3')).toBe(false);
    expect(adresseMédiaValide('file:///etc/passwd')).toBe(false);
    expect(adresseMédiaValide('data:audio/mpeg,abc')).toBe(false);
    expect(adresseMédiaValide(42)).toBe(false);
  });

  it("l'historique ne recopie pas les fichiers : une référence courte les remplace", () => {
    const valeur = { a: { src: GROS, x: 1 }, b: [{ src: GROS }] };
    const texte = enJsonCompact(valeur);
    expect(texte.length).toBeLessThan(200);
    expect(depuisJsonCompact(texte)).toEqual(valeur);
  });
});

describe('sons et vidéos dans le texte', () => {
  const avecMédias = doc({ type: 'paragraph', content: [{ type: 'text', text: 'Écoutez :' }] }, média(MP3, 'Chanson'), média(MP4, 'Film'));

  it('sont rangés dans media/ du fichier .tto, sans être recopiés dans document.json', () => {
    const fichiers = unzipSync(packTto(avecMédias));
    expect(Object.keys(fichiers).filter((n) => n.startsWith('media/')).sort()).toEqual(['media/audio-1.mp3', 'media/video-2.mp4']);
    expect(strFromU8(fichiers['document.json'])).not.toContain('data:');
    expect(Array.from(fichiers['media/audio-1.mp3'].slice(0, 3))).toEqual([0xff, 0xfb, 0x90]);
  });

  it('gardent leur contenu exact à la relecture', () => {
    expect(unpackTto(packTto(avecMédias))).toEqual(avecMédias);
  });

  it("un même fichier utilisé deux fois n'est écrit qu'une fois", () => {
    const fichiers = unzipSync(packTto(doc(média(MP3, 'A'), média(MP3, 'B'))));
    expect(Object.keys(fichiers).filter((n) => n.startsWith('media/'))).toHaveLength(1);
  });

  it('un lecteur dont le fichier manque, ou qui vise ailleurs, est retiré au lieu de planter', () => {
    const archive = (src: string) =>
      zipSync({
        'manifest.json': strToU8(JSON.stringify({ format: 'text-to-one', version: 1 })),
        'document.json': strToU8(JSON.stringify(doc({ type: 'paragraph' }, { type: 'media', attrs: { src, title: 'x' } }))),
      });
    for (const src of ['media/audio-9.mp3', 'https://exemple.fr/a.mp3', '../../secret.mp3', 'media/../../a.mp3', 'media/script.js']) {
      expect(unpackTto(archive(src)).content).toHaveLength(1);
    }
  });

  it('page HTML : un lecteur natif par fichier', () => {
    const html = toHtmlDocument(avecMédias, 'Test');
    expect(html).toContain('<audio controls');
    expect(html).toContain('<video controls');
    expect(html).toContain('Chanson</figcaption>');
    expect(html).not.toContain('<script');
  });

  it("l'aller-retour HTML garde le fichier et le titre, et refuse une adresse extérieure", () => {
    const retour = generateJSON(generateHTML(avecMédias, buildExtensions()), buildExtensions());
    expect(retour.content[1]).toMatchObject({ type: 'media', attrs: { src: MP3, title: 'Chanson' } });
    const dehors = generateJSON('<figure data-media="audio"><audio src="https://exemple.fr/a.mp3"></audio></figure>', buildExtensions());
    expect(JSON.stringify(dehors)).not.toContain('exemple.fr');
  });

  it('texte, Markdown et Word : un repère lisible à la place', async () => {
    expect(toPlainText(avecMédias)).toContain('[audio : Chanson]');
    expect(toPlainText(avecMédias)).toContain('[vidéo : Film]');
    expect(toMarkdown(avecMédias)).toContain('*\\[audio : Chanson\\]*');
    const xml = strFromU8(unzipSync(await exportDocx(avecMédias))['word/document.xml']);
    expect(xml).toContain('[audio : Chanson]');
    expect(xml).not.toContain('base64');
  });
});

const objetMédia = (id: string, src: string, kind: 'audio' | 'video'): SlidesDoc['slides'][number]['objects'][number] => ({ id, type: 'media', kind, x: 100, y: 100, w: 400, h: 200, src, title: id });
const présentation = (): SlidesDoc => ({ slides: [{ id: 's1', background: '#ffffff', objects: [objetMédia('m1', MP3, 'audio'), objetMédia('m2', MP4, 'video')] }] });

describe('sons et vidéos dans les présentations', () => {
  it('sont rangés dans media/ du fichier .ttp et relus à l’identique', () => {
    const fichiers = unzipSync(packSlides(présentation()));
    expect(Object.keys(fichiers).filter((n) => n.startsWith('media/')).sort()).toEqual(['media/audio-1.mp3', 'media/video-2.mp4']);
    expect(strFromU8(fichiers['slides.json'])).not.toContain('data:');
    expect(unpackSlides(packSlides(présentation()))).toEqual(présentation());
  });

  it('un fichier abîmé ne garde que ce qui est valide', () => {
    const propre = nettoyerPrésentation({ slides: [{ objects: [{ type: 'media', kind: 'nimporte', src: MP4, title: 'x'.repeat(999), x: 1, y: 2, w: 3, h: 4 }, { type: 'media', src: 42 }] }] });
    expect(propre.slides[0].objects).toHaveLength(1);
    expect(propre.slides[0].objects[0]).toMatchObject({ type: 'media', kind: 'video' });
  });

  it('export PowerPoint : le son et la vidéo sont intégrés', async () => {
    const fichiers = unzipSync(await exportPptx(présentation(), 'Essai'));
    const noms = Object.keys(fichiers);
    expect(noms.some((n) => /^ppt\/media\/.*\.mp3$/.test(n))).toBe(true);
    expect(noms.some((n) => /^ppt\/media\/.*\.mp4$/.test(n))).toBe(true);
    expect(strFromU8(fichiers['ppt/slides/slide1.xml'])).toMatch(/audioFile|videoFile/);
  });

  it("dupliquer un objet et annuler ne recopient pas le fichier dans l'historique", () => {
    const d = présentation();
    const copie = cloner(d.slides[0].objects[0]);
    expect(copie).toMatchObject({ type: 'media', src: MP3 });
    expect(copie.id).not.toBe('m1');
    const historique = new Historique<SlidesDoc>(d);
    d.slides[0].objects.push(copie);
    expect(historique.commit(d)).toBe(true);
    expect(historique.undo()).toEqual(présentation());
    expect(historique.redo()).toEqual(d);
  });
});

describe('sons et vidéos dans le tableur', () => {
  const classeur = () => {
    const moteur = new SheetEngine();
    moteur.setRaw(0, 0, 'Piste 1');
    moteur.setMedia(1, 2, { kind: 'audio', title: 'Piste', src: MP3 });
    moteur.setMedia(4, 0, { kind: 'video', title: 'Clip', src: MP4 });
    return moteur;
  };

  it('sont rattachés à leur cellule et rangés dans media/ du fichier .tts', () => {
    const fichiers = unzipSync(packSheet(classeur().toDoc()));
    expect(Object.keys(fichiers).filter((n) => n.startsWith('media/')).sort()).toEqual(['media/audio-1.mp3', 'media/video-2.mp4']);
    expect(strFromU8(fichiers['sheet.json'])).not.toContain('data:');
    expect(unpackSheet(packSheet(classeur().toDoc())).media).toEqual({ C2: { kind: 'audio', title: 'Piste', src: MP3 }, A5: { kind: 'video', title: 'Clip', src: MP4 } });
  });

  it("un classeur sans son ni vidéo garde exactement sa forme d'avant", () => {
    const seul = new SheetEngine();
    seul.setRaw(0, 0, '1');
    expect('media' in seul.toDoc()).toBe(false);
  });

  it('suivent leur cellule quand on insère ou supprime des lignes et des colonnes', () => {
    const moteur = classeur();
    moteur.insertRow(0);
    expect(moteur.media(2, 2)?.title).toBe('Piste');
    moteur.insertCol(0);
    expect(moteur.media(2, 3)?.title).toBe('Piste');
    moteur.deleteRow(2);
    expect(moteur.media(2, 3)).toBeUndefined();
    expect(moteur.media(4, 1)?.title).toBe('Clip');
  });

  it('annuler et rétablir remettent le son ou la vidéo', () => {
    const moteur = new SheetEngine();
    moteur.setMedia(0, 0, { kind: 'audio', title: 'Piste', src: GROS });
    moteur.commit();
    moteur.setMedia(0, 0, null);
    moteur.commit();
    expect(moteur.media(0, 0)).toBeUndefined();
    expect(moteur.undo()).toBe(true);
    expect(moteur.media(0, 0)?.src).toBe(GROS);
    expect(moteur.redo()).toBe(true);
    expect(moteur.media(0, 0)).toBeUndefined();
  });

  it('un fichier abîmé est nettoyé : fichier absent, adresse extérieure, trop de médias', () => {
    const src = (chemin: string) => chemin;
    const trop = Object.fromEntries(Array.from({ length: MAX_MEDIA + 5 }, (_, i) => [`A${i + 1}`, { kind: 'audio', title: 't', src: MP3 }]));
    const archive = (media: unknown) =>
      zipSync({
        'manifest.json': strToU8(JSON.stringify({ format: 'text-to-one-sheet', version: 1 })),
        'sheet.json': strToU8(JSON.stringify({ rows: 10, cols: 5, cells: {}, styles: {}, colWidths: {}, media })),
      });
    expect(unpackSheet(archive({ A1: { kind: 'audio', title: 'x', src: src('media/absent.mp3') }, B1: { kind: 'audio', title: 'x', src: src('https://exemple.fr/a.mp3') } })).media).toBeUndefined();
    expect(Object.keys(unpackSheet(archive(trop)).media ?? {})).toHaveLength(MAX_MEDIA);
  });
});
