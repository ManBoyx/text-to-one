import type { DocumentCodec } from '../codec';
import { FormatError } from '../errors';
import type { SlidesDoc } from './model';
import { exportPptx } from './pptx';
import { packSlides, unpackSlides } from './ttp';

/** Le codec des présentations : format propre .ttp, export PowerPoint (.pptx). */
export const slidesCodec: DocumentCodec<SlidesDoc> = {
  app: 'slides',

  async encode(kind, doc, title) {
    if (kind === 'ttp') return packSlides(doc);
    if (kind === 'pptx') return exportPptx(doc, title);
    throw new FormatError("Ce type d'export n'est pas disponible pour une présentation.");
  },

  async decode(fileName, bytes) {
    const extension = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase();
    if (extension === 'ttp') return { doc: unpackSlides(bytes), warnings: [], native: true };
    if (extension === 'pptx' || extension === 'ppt') {
      throw new FormatError("L'ouverture des fichiers PowerPoint n'est pas encore possible : Text to One sait seulement en écrire (Fichier > Exporter). Ouvre plutôt une présentation .ttp.");
    }
    throw new FormatError(`Ce type de fichier n'est pas pris en charge : « ${fileName} ». Les présentations s'ouvrent au format .ttp.`);
  },
};
