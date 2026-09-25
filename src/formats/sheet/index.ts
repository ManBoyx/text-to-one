import { FormatError } from '../errors';
import type { DocumentCodec } from '../codec';
import { csvFromSheet, sheetFromCsv } from './csv';
import type { SheetDoc } from './model';
import { packSheet, unpackSheet } from './tts';
import { exportXlsx, importXlsx } from './xlsx';

const encodeur = new TextEncoder();

/** Le codec du tableur : format propre .tts, import et export Excel (.xlsx) et CSV. */
export const sheetCodec: DocumentCodec<SheetDoc> = {
  app: 'sheet',

  async encode(kind, doc) {
    switch (kind) {
      case 'tts':
        return packSheet(doc);
      case 'xlsx':
        return exportXlsx(doc);
      case 'csv':
        return encodeur.encode(csvFromSheet(doc));
      default:
        throw new FormatError("Ce type d'export n'est pas disponible pour un tableur.");
    }
  },

  async decode(fileName, bytes) {
    const extension = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase();
    if (extension === 'tts') return { doc: unpackSheet(bytes), warnings: [], native: true };
    if (extension === 'xlsx') return { ...importXlsx(bytes), native: false };
    if (extension === 'csv') return { ...sheetFromCsv(new TextDecoder('utf-8').decode(bytes)), native: false };
    if (extension === 'xls') {
      throw new FormatError('Les anciens fichiers .xls ne sont pas pris en charge. Enregistre le classeur au format .xlsx depuis ton logiciel, puis ouvre-le ici.');
    }
    throw new FormatError(`Ce type de fichier n'est pas pris en charge : « ${fileName} ». Le tableur ouvre les fichiers .tts, .xlsx et .csv.`);
  },
};
