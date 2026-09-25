import type { JSONContent } from '@tiptap/core';
import type { SaveKind } from '../shared/kinds';
import type { DocumentCodec } from './codec';
import { exportDocx } from './docx-export';
import { importDocx } from './docx-import';
import { FormatError } from './errors';
import { toHtmlDocument, toMarkdown, toPlainText } from './export-text';
import { packTto, unpackTto } from './tto';

export { FormatError } from './errors';

const encodeur = new TextEncoder();

/** Transforme le document en octets prêts à être écrits dans un fichier du type demandé. */
export async function encodeDocument(kind: SaveKind, doc: JSONContent, title: string): Promise<Uint8Array> {
  switch (kind) {
    case 'tto':
      return packTto(doc);
    case 'docx':
      return exportDocx(doc);
    case 'html':
      return encodeur.encode(toHtmlDocument(doc, title));
    case 'txt':
      return encodeur.encode(toPlainText(doc));
    case 'md':
      return encodeur.encode(toMarkdown(doc));
    default:
      throw new FormatError("Ce type d'export n'est pas disponible pour un document texte.");
  }
}

export interface DecodedDocument {
  doc: JSONContent;
  /** Ce qui n'a pas pu être repris, à montrer à l'utilisateur. */
  warnings: string[];
  source: 'tto' | 'docx';
}

/** Ouvre un fichier .tto ou .docx d'après son extension ; lève une FormatError au message clair sinon. */
export async function decodeDocument(fileName: string, bytes: Uint8Array): Promise<DecodedDocument> {
  const extension = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase();
  if (extension === 'tto') return { doc: unpackTto(bytes), warnings: [], source: 'tto' };
  if (extension === 'docx') return { ...importDocx(bytes), source: 'docx' };
  if (extension === 'doc') {
    throw new FormatError('Les anciens fichiers .doc ne sont pas pris en charge. Enregistre le document au format .docx depuis ton logiciel, puis ouvre-le ici.');
  }
  throw new FormatError(`Ce type de fichier n'est pas pris en charge : « ${fileName} ». Text to One ouvre les fichiers .tto et .docx.`);
}

/** Le codec du traitement de texte. */
export const textCodec: DocumentCodec<JSONContent> = {
  app: 'text',
  encode: encodeDocument,
  async decode(fileName, bytes) {
    const lu = await decodeDocument(fileName, bytes);
    return { doc: lu.doc, warnings: lu.warnings, native: lu.source === 'tto' };
  },
};
