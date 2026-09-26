import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { adresseMédiaValide, extDeMédia, genreDeAdresse, mimeDeMédiaParExt } from '../../shared/media';
import { FormatError } from '../errors';
import { bytesToDataUrl, dataUrlToBytes, extForMime, mimeForExt } from '../images';
import { MAX_OBJECTS, MAX_SLIDES, SLIDE_H, SLIDE_W, nouvelId, styleDeTexte, type Align, type Slide, type SlideObject, type SlidesDoc, type TextStyle } from './model';

export const TTP_FORMAT_VERSION = 1;
const INVALIDE = "Ce fichier n'est pas une présentation Text to One valide.";
const TAILLE_MAX_FICHIER = 200 * 1024 * 1024;
const COULEUR = /^#[0-9a-fA-F]{6}$/;
const ALIGNEMENTS: Align[] = ['left', 'center', 'right'];

const nombre = (v: unknown, défaut: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : défaut;
const couleur = (v: unknown, défaut: string): string => (typeof v === 'string' && COULEUR.test(v) ? v : défaut);
const couleurOuRien = (v: unknown): string | null => (typeof v === 'string' && COULEUR.test(v) ? v : null);
const texte = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 20000) : '');
const identifiant = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : nouvelId());

function nettoyerStyle(brut: unknown): TextStyle {
  const s = (typeof brut === 'object' && brut !== null ? brut : {}) as Record<string, unknown>;
  return styleDeTexte({
    size: nombre(s.size, 28, 6, 400),
    bold: s.bold === true,
    italic: s.italic === true,
    underline: s.underline === true,
    color: couleur(s.color, '#1d2330'),
    align: ALIGNEMENTS.includes(s.align as Align) ? (s.align as Align) : 'left',
  });
}

function nettoyerObjet(brut: unknown): SlideObject | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const o = brut as Record<string, unknown>;
  const base = {
    id: identifiant(o.id),
    x: nombre(o.x, 0, -5000, 5000),
    y: nombre(o.y, 0, -5000, 5000),
    w: nombre(o.w, 100, 4, 5000),
    h: nombre(o.h, 50, 4, 5000),
  };
  if (o.type === 'text') return { ...base, type: 'text', text: texte(o.text), style: nettoyerStyle(o.style) };
  if (o.type === 'shape') {
    return {
      ...base,
      type: 'shape',
      shape: o.shape === 'ellipse' ? 'ellipse' : 'rect',
      fill: couleurOuRien(o.fill),
      stroke: couleurOuRien(o.stroke),
      strokeWidth: nombre(o.strokeWidth, 2, 0, 40),
      text: texte(o.text),
      style: nettoyerStyle(o.style),
    };
  }
  if (o.type === 'media' && typeof o.src === 'string') {
    const genre = o.kind === 'video' ? 'video' : o.kind === 'audio' ? 'audio' : null;
    return { ...base, type: 'media', kind: genre ?? genreDeAdresse(o.src), src: o.src, title: texte(o.title).slice(0, 200) };
  }
  if (o.type === 'image' && typeof o.src === 'string') return { ...base, type: 'image', src: o.src, alt: texte(o.alt).slice(0, 500) };
  return null;
}

/** Ne garde d'une présentation que ce qui est valide : un fichier abîmé ou hostile ne doit rien casser. */
export function nettoyerPrésentation(brut: unknown): SlidesDoc {
  const o = (typeof brut === 'object' && brut !== null ? brut : {}) as Record<string, unknown>;
  const slides: Slide[] = (Array.isArray(o.slides) ? o.slides : []).slice(0, MAX_SLIDES).map((d: unknown) => {
    const s = (typeof d === 'object' && d !== null ? d : {}) as Record<string, unknown>;
    const objets = (Array.isArray(s.objects) ? s.objects : []).slice(0, MAX_OBJECTS).map(nettoyerObjet).filter((x): x is SlideObject => x !== null);
    return { id: identifiant(s.id), background: couleur(s.background, '#ffffff'), objects: objets };
  });
  return { slides: slides.length ? slides : [{ id: nouvelId(), background: '#ffffff', objects: [] }] };
}

/** Écrit une présentation : archive zip avec manifest.json, slides.json et les images dans media/. */
export function packSlides(doc: SlidesDoc): Uint8Array {
  const médias: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const nomParAdresse = new Map<string, string>();
  const réécrit: SlidesDoc = {
    slides: doc.slides.map((d) => ({
      ...d,
      objects: d.objects.map((o) => {
        if (o.type === 'media' && adresseMédiaValide(o.src)) {
          let nom = nomParAdresse.get(o.src);
          if (!nom) {
            const décodé = dataUrlToBytes(o.src);
            if (!décodé) return o;
            nom = `media/${o.kind}-${nomParAdresse.size + 1}.${extDeMédia(décodé.mime)}`;
            nomParAdresse.set(o.src, nom);
            médias[nom] = [décodé.bytes, { level: 0 }]; // déjà compressé
          }
          return { ...o, src: nom };
        }
        if (o.type !== 'image' || !o.src.startsWith('data:')) return o;
        let nom = nomParAdresse.get(o.src);
        if (!nom) {
          const décodée = dataUrlToBytes(o.src);
          if (!décodée?.mime.startsWith('image/')) return o;
          nom = `media/image-${nomParAdresse.size + 1}.${extForMime(décodée.mime)}`;
          nomParAdresse.set(o.src, nom);
          médias[nom] = décodée.bytes;
        }
        return { ...o, src: nom };
      }),
    })),
  };
  return zipSync(
    {
      'manifest.json': strToU8(JSON.stringify({ format: 'text-to-one-slides', version: TTP_FORMAT_VERSION, width: SLIDE_W, height: SLIDE_H })),
      'slides.json': strToU8(JSON.stringify(réécrit)),
      ...médias,
    },
    { level: 6 },
  );
}

/** Relit une présentation ; lève une FormatError au message clair si le fichier est invalide. */
export function unpackSlides(octets: Uint8Array): SlidesDoc {
  let fichiers: Record<string, Uint8Array>;
  try {
    fichiers = unzipSync(octets, { filter: (f) => f.originalSize <= TAILLE_MAX_FICHIER });
  } catch {
    throw new FormatError(INVALIDE);
  }
  const manifesteBrut = fichiers['manifest.json'];
  const diapositivesBrutes = fichiers['slides.json'];
  if (!manifesteBrut || !diapositivesBrutes) throw new FormatError(INVALIDE);
  let manifeste: { format?: unknown; version?: unknown } | null;
  let brut: unknown;
  try {
    manifeste = JSON.parse(strFromU8(manifesteBrut));
    brut = JSON.parse(strFromU8(diapositivesBrutes));
  } catch {
    throw new FormatError(INVALIDE);
  }
  if (manifeste?.format !== 'text-to-one-slides' || typeof manifeste.version !== 'number') throw new FormatError(INVALIDE);
  if (manifeste.version > TTP_FORMAT_VERSION) {
    throw new FormatError("Cette présentation a été créée avec une version plus récente de Text to One. Mets le logiciel à jour pour l'ouvrir.");
  }
  if (typeof brut !== 'object' || brut === null) throw new FormatError(INVALIDE);
  const doc = nettoyerPrésentation(brut);
  // Les images : on ne lit que dans l'archive ; une image dont le fichier manque est retirée.
  return {
    slides: doc.slides.map((d) => ({
      ...d,
      objects: d.objects.flatMap((o): SlideObject[] => {
        if (o.type === 'media') {
          if (adresseMédiaValide(o.src)) return [o];
          const données = o.src.startsWith('media/') ? fichiers[o.src] : undefined;
          const mime = mimeDeMédiaParExt(o.src.split('.').pop() ?? '');
          return données && mime ? [{ ...o, src: bytesToDataUrl(données, mime) }] : [];
        }
        if (o.type !== 'image') return [o];
        if (o.src.startsWith('data:image/')) return [o];
        const données = fichiers[o.src];
        const mime = mimeForExt(o.src.split('.').pop() ?? '');
        return données && mime && o.src.startsWith('media/') ? [{ ...o, src: bytesToDataUrl(données, mime) }] : [];
      }),
    })),
  };
}
