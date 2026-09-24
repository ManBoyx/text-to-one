import type { JSONContent } from '@tiptap/core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { FormatError } from './errors';
import { bytesToDataUrl, dataUrlToBytes, extForMime, mimeForExt } from './images';

/** Numéro du format : à augmenter si la structure de l'archive change. */
export const TTO_FORMAT_VERSION = 1;

const TAILLE_MAX_FICHIER = 200 * 1024 * 1024;
const INVALIDE = "Ce fichier n'est pas un document Text to One valide.";

/** Écrit un document : archive zip avec manifest.json, document.json et les images dans media/. */
export function packTto(doc: JSONContent): Uint8Array {
  const médias: Record<string, Uint8Array> = {};
  const nomParAdresse = new Map<string, string>();

  const réécrire = (noeud: JSONContent): JSONContent => {
    let suivant = noeud;
    const src = noeud.attrs?.src;
    if (noeud.type === 'image' && typeof src === 'string' && src.startsWith('data:')) {
      let nom = nomParAdresse.get(src);
      if (!nom) {
        const décodé = dataUrlToBytes(src);
        if (décodé?.mime.startsWith('image/')) {
          nom = `media/image-${nomParAdresse.size + 1}.${extForMime(décodé.mime)}`;
          nomParAdresse.set(src, nom);
          médias[nom] = décodé.bytes;
        }
      }
      if (nom) suivant = { ...noeud, attrs: { ...noeud.attrs, src: nom } };
    }
    return suivant.content ? { ...suivant, content: suivant.content.map(réécrire) } : suivant;
  };

  return zipSync(
    {
      'manifest.json': strToU8(JSON.stringify({ format: 'text-to-one', version: TTO_FORMAT_VERSION })),
      'document.json': strToU8(JSON.stringify(réécrire(doc))),
      ...médias,
    },
    { level: 6 },
  );
}

/** Relit un document ; lève une FormatError au message clair si le fichier est invalide. */
export function unpackTto(bytes: Uint8Array): JSONContent {
  let fichiers: Record<string, Uint8Array>;
  try {
    fichiers = unzipSync(bytes, { filter: (fichier) => fichier.originalSize <= TAILLE_MAX_FICHIER });
  } catch {
    throw new FormatError(INVALIDE);
  }
  const manifesteBrut = fichiers['manifest.json'];
  const documentBrut = fichiers['document.json'];
  if (!manifesteBrut || !documentBrut) throw new FormatError(INVALIDE);

  let manifeste: { format?: unknown; version?: unknown } | null;
  let doc: JSONContent | null;
  try {
    manifeste = JSON.parse(strFromU8(manifesteBrut));
    doc = JSON.parse(strFromU8(documentBrut));
  } catch {
    throw new FormatError(INVALIDE);
  }
  if (manifeste?.format !== 'text-to-one' || typeof manifeste.version !== 'number') throw new FormatError(INVALIDE);
  if (manifeste.version > TTO_FORMAT_VERSION) {
    throw new FormatError("Ce document a été créé avec une version plus récente de Text to One. Mets le logiciel à jour pour l'ouvrir.");
  }
  if (!doc || doc.type !== 'doc') throw new FormatError(INVALIDE);

  const restaurer = (noeud: JSONContent): JSONContent | null => {
    const src = noeud.attrs?.src;
    if (noeud.type === 'image' && typeof src === 'string' && src.startsWith('media/')) {
      const données = fichiers[src]; // on ne lit que dans l'archive, jamais sur le disque
      const mime = mimeForExt(src.split('.').pop() ?? '');
      if (!données || !mime) return null;
      return { ...noeud, attrs: { ...noeud.attrs, src: bytesToDataUrl(données, mime) } };
    }
    if (!noeud.content) return noeud;
    return { ...noeud, content: noeud.content.map(restaurer).filter((n): n is JSONContent => n !== null) };
  };
  return restaurer(doc) ?? doc;
}
