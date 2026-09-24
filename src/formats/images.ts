const MIME_PAR_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

const EXTENSION_PAR_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export function extForMime(mime: string): string {
  return EXTENSION_PAR_MIME[mime.toLowerCase()] ?? 'bin';
}

export function mimeForExt(ext: string): string | undefined {
  return MIME_PAR_EXTENSION[ext.toLowerCase()];
}

/** Décode une adresse « data: » ; renvoie null si ce n'en est pas une ou si elle est illisible. */
export function dataUrlToBytes(url: string): { mime: string; bytes: Uint8Array } | null {
  const morceaux = /^data:([^;,]+)((?:;[^;,]+)*),([\s\S]*)$/.exec(url);
  if (!morceaux) return null;
  const mime = morceaux[1].toLowerCase();
  try {
    if (morceaux[2].includes(';base64')) {
      const binaire = atob(morceaux[3]);
      const bytes = new Uint8Array(binaire.length);
      for (let i = 0; i < binaire.length; i++) bytes[i] = binaire.charCodeAt(i);
      return { mime, bytes };
    }
    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(morceaux[3])) };
  } catch {
    return null;
  }
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binaire = '';
  const TRANCHE = 0x8000; // évite de dépasser la pile avec de grosses images
  for (let i = 0; i < bytes.length; i += TRANCHE) binaire += String.fromCharCode(...bytes.subarray(i, i + TRANCHE));
  return `data:${mime};base64,${btoa(binaire)}`;
}

/** Taille en pixels lue dans l'en-tête d'un PNG, d'un GIF ou d'un JPEG ; null si le format est inconnu. */
export function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const vue = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: vue.getUint32(16), height: vue.getUint32(20) };
  }
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return tailleJpeg(bytes);
  return null;
}

function tailleJpeg(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marqueur = b[i + 1];
    // Les marqueurs SOF0 à SOF15 (sauf 0xc4, 0xc8 et 0xcc) portent la taille de l'image.
    if (marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}
