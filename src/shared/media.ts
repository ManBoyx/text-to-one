import { Node } from '@tiptap/core';

/** Taille maximale d'un son ou d'une vidéo : le fichier est gardé en entier dans le document. */
export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;

export type GenreMédia = 'audio' | 'video';

const TYPES: { ext: string; mime: string }[] = [
  { ext: 'mp3', mime: 'audio/mpeg' },
  { ext: 'm4a', mime: 'audio/mp4' },
  { ext: 'aac', mime: 'audio/aac' },
  { ext: 'ogg', mime: 'audio/ogg' },
  { ext: 'oga', mime: 'audio/ogg' },
  { ext: 'opus', mime: 'audio/ogg' },
  { ext: 'wav', mime: 'audio/wav' },
  { ext: 'flac', mime: 'audio/flac' },
  { ext: 'weba', mime: 'audio/webm' },
  { ext: 'mp4', mime: 'video/mp4' },
  { ext: 'm4v', mime: 'video/mp4' },
  { ext: 'webm', mime: 'video/webm' },
  { ext: 'ogv', mime: 'video/ogg' },
];
/** Les noms de type que les navigateurs et les systèmes donnent à un même format. */
const SYNONYMES: Record<string, string> = { 'audio/mp3': 'audio/mpeg', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/x-m4a': 'audio/mp4', 'audio/x-flac': 'audio/flac', 'audio/vorbis': 'audio/ogg' };
const MIMES = new Set(TYPES.map((t) => t.mime));

/** Pour le sélecteur de fichiers. */
export const MEDIA_ACCEPT = [...TYPES.map((t) => `.${t.ext}`), ...MIMES].join(',');

export const genreDeMime = (mime: string): GenreMédia | null => {
  const m = SYNONYMES[mime.toLowerCase()] ?? mime.toLowerCase();
  return MIMES.has(m) ? (m.startsWith('video/') ? 'video' : 'audio') : null;
};

/** Le type normalisé d'un son ou d'une vidéo, à partir du type annoncé puis de l'extension du nom. */
export function typeDeMédia(nom: string, typeAnnoncé = ''): { mime: string; genre: GenreMédia } | null {
  const annoncé = SYNONYMES[typeAnnoncé.toLowerCase()] ?? typeAnnoncé.toLowerCase();
  const ext = /\.([A-Za-z0-9]+)$/.exec(nom)?.[1]?.toLowerCase();
  // Une extension « .mp4 » peut n'être que du son : le type annoncé par le système, s'il est fiable, l'emporte.
  const mime = MIMES.has(annoncé) ? annoncé : TYPES.find((t) => t.ext === ext)?.mime;
  const genre = mime ? genreDeMime(mime) : null;
  return mime && genre ? { mime, genre } : null;
}

export const extDeMédia = (mime: string): string => TYPES.find((t) => t.mime === (SYNONYMES[mime.toLowerCase()] ?? mime.toLowerCase()))?.ext ?? 'bin';
export const mimeDeMédiaParExt = (ext: string): string | undefined => TYPES.find((t) => t.ext === ext.toLowerCase())?.mime;

/** Vrai pour une adresse « data: » d'un son ou d'une vidéo reconnus, en base64 : rien d'autre n'entre dans un document. */
export function adresseMédiaValide(src: unknown): boolean {
  if (typeof src !== 'string') return false;
  const morceau = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,/.exec(src.slice(0, 80));
  return !!morceau && MIMES.has(morceau[1]);
}

export const genreDeAdresse = (src: string): GenreMédia => (src.startsWith('data:video/') ? 'video' : 'audio');

/** Nom affiché d'un fichier : sans dossier ni extension. */
export const titreDeFichier = (nom: string): string => nom.replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]+$/, '').slice(0, 200);

/** Fabrique le lecteur (« audio » ou « video ») ; il n'a jamais de lecture automatique. */
export function créerLecteur(src: string, titre: string, contrôles = true): HTMLAudioElement | HTMLVideoElement {
  const lecteur = document.createElement(genreDeAdresse(src) === 'video' ? 'video' : 'audio');
  lecteur.preload = 'metadata';
  lecteur.controls = contrôles;
  lecteur.src = src;
  lecteur.title = titre;
  lecteur.setAttribute('aria-label', titre);
  return lecteur;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    media: {
      /** Insère un lecteur de son ou de vidéo à la sélection. */
      insertMedia: (src: string, titre: string) => ReturnType;
    };
  }
}

/** Un son ou une vidéo dans le texte, avec son lecteur. */
export const Media = Node.create({
  name: 'media',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      title: {
        default: '',
        parseHTML: (élément: HTMLElement) => élément.getAttribute('data-title') ?? '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-media]',
        getAttrs: (élément) => {
          const src = (élément as HTMLElement).querySelector('audio, video')?.getAttribute('src');
          return adresseMédiaValide(src) ? { src } : false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const src = String(node.attrs.src ?? '');
    const genre = genreDeAdresse(src);
    const titre = String(node.attrs.title ?? '');
    return [
      'figure',
      { class: 'media-block', 'data-media': genre, 'data-title': titre },
      [genre, { controls: '', preload: 'metadata', src, title: titre }],
      ...(titre ? [['figcaption', {}, titre]] : []),
    ] as never;
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure');
      dom.className = 'media-block';
      dom.contentEditable = 'false';
      let src = '';
      let titre = '';
      let légende: HTMLElement | null = null;
      const dessiner = (s: string, t: string) => {
        if (s === src && t === titre) return;
        src = s;
        titre = t;
        dom.dataset.media = genreDeAdresse(s);
        dom.replaceChildren(adresseMédiaValide(s) ? créerLecteur(s, t) : document.createTextNode(''));
        légende = null;
        if (t) {
          légende = document.createElement('figcaption');
          légende.textContent = t;
          dom.append(légende);
        }
      };
      dessiner(String(node.attrs.src ?? ''), String(node.attrs.title ?? ''));
      return {
        dom,
        update: (autre) => {
          if (autre.type !== node.type) return false;
          dessiner(String(autre.attrs.src ?? ''), String(autre.attrs.title ?? ''));
          return true;
        },
        // Les boutons du lecteur sont à lui : l'éditeur n'y touche pas.
        stopEvent: (événement) => (événement.target as HTMLElement).closest?.('audio, video') !== null,
        ignoreMutation: () => true,
      };
    };
  },

  addCommands() {
    return {
      insertMedia:
        (src, titre) =>
        ({ commands }) =>
          adresseMédiaValide(src) ? commands.insertContent([{ type: this.name, attrs: { src, title: titre } }, { type: 'paragraph' }]) : false,
    };
  },
});

// ---------- Historique « annuler » ----------
// Les historiques gardent un instantané du document après chaque action. Y recopier 25 Mo de son ou de vidéo à
// chaque fois épuiserait la mémoire : on n'y écrit qu'une référence courte, et le contenu reste dans ce registre.

const RÉFÉRENCE = '@media:';
const parSource = new Map<string, string>();
const parRéférence = new Map<string, string>();

const référenceDe = (src: string): string => {
  let référence = parSource.get(src);
  if (!référence) {
    référence = `${RÉFÉRENCE}${parSource.size + 1}`;
    parSource.set(src, référence);
    parRéférence.set(référence, src);
  }
  return référence;
};

const estGrosMédia = (clé: string, valeur: unknown): valeur is string => clé === 'src' && typeof valeur === 'string' && valeur.length > 2048 && adresseMédiaValide(valeur);

/** Comme JSON.stringify, mais les sons et vidéos n'y sont écrits que par référence. */
export const enJsonCompact = (valeur: unknown): string => JSON.stringify(valeur, (clé, v) => (estGrosMédia(clé, v) ? référenceDe(v) : v));

/** L'inverse de `enJsonCompact` : les références redeviennent les fichiers. */
export const depuisJsonCompact = <T>(texte: string): T =>
  JSON.parse(texte, (clé, v) => (clé === 'src' && typeof v === 'string' && v.startsWith(RÉFÉRENCE) ? (parRéférence.get(v) ?? '') : v)) as T;
