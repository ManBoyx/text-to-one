import { describe, expect, it } from 'vitest';
import { bytesToDataUrl, dataUrlToBytes, extForMime, mimeForExt, readImageSize } from '../../src/formats/images';
import { GIF_1PX, PNG_1PX } from './sample-doc';

function pngDeTaille(largeur: number, hauteur: number): Uint8Array {
  const octets = new Uint8Array(33);
  octets.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const vue = new DataView(octets.buffer);
  vue.setUint32(16, largeur);
  vue.setUint32(20, hauteur);
  return octets;
}

describe('images', () => {
  it("convertit une adresse data en octets, et l'inverse", () => {
    const décodé = dataUrlToBytes(PNG_1PX);
    expect(décodé?.mime).toBe('image/png');
    expect([...(décodé?.bytes.slice(0, 4) ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(bytesToDataUrl(décodé!.bytes, 'image/png')).toBe(PNG_1PX);
  });

  it("refuse ce qui n'est pas une adresse data", () => {
    expect(dataUrlToBytes('https://exemple.fr/a.png')).toBeNull();
    expect(dataUrlToBytes('data:image/png;base64,***')).toBeNull();
  });

  it('gère une grosse image sans dépasser la pile', () => {
    const gros = new Uint8Array(3_000_000).fill(7);
    const retour = dataUrlToBytes(bytesToDataUrl(gros, 'image/png'));
    expect(retour?.bytes.length).toBe(3_000_000);
  });

  it('associe types MIME et extensions', () => {
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('image/inconnu')).toBe('bin');
    expect(mimeForExt('JPG')).toBe('image/jpeg');
    expect(mimeForExt('exe')).toBeUndefined();
  });

  it('lit la taille des PNG, GIF et JPEG', () => {
    expect(readImageSize(dataUrlToBytes(PNG_1PX)!.bytes)).toEqual({ width: 1, height: 1 });
    expect(readImageSize(dataUrlToBytes(GIF_1PX)!.bytes)).toEqual({ width: 1, height: 1 });
    expect(readImageSize(pngDeTaille(300, 200))).toEqual({ width: 300, height: 200 });
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, 0x01, 0xe0, 0x02, 0x80, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(readImageSize(jpeg)).toEqual({ width: 640, height: 480 });
    expect(readImageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
