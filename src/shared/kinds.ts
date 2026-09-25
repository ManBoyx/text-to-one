/** Les trois applications de la suite. */
export type AppKind = 'text' | 'sheet' | 'slides';

export type SaveKind = 'tto' | 'docx' | 'html' | 'txt' | 'md' | 'tts' | 'xlsx' | 'csv' | 'ttp' | 'pptx';

export const KIND_INFO: Record<SaveKind, { label: string; extension: string }> = {
  tto: { label: 'Document Text to One', extension: 'tto' },
  docx: { label: 'Document Word', extension: 'docx' },
  html: { label: 'Page web', extension: 'html' },
  txt: { label: 'Texte brut', extension: 'txt' },
  md: { label: 'Markdown', extension: 'md' },
  tts: { label: 'Classeur Text to One', extension: 'tts' },
  xlsx: { label: 'Classeur Excel', extension: 'xlsx' },
  csv: { label: 'Tableau CSV', extension: 'csv' },
  ttp: { label: 'Présentation Text to One', extension: 'ttp' },
  pptx: { label: 'Présentation PowerPoint', extension: 'pptx' },
};

/** Le format propre de chaque application : le seul qu'on enregistre « en place ». */
export const NATIVE_KIND: Record<AppKind, SaveKind> = { text: 'tto', sheet: 'tts', slides: 'ttp' };

/** Les fichiers que chaque application sait ouvrir. */
export const APP_EXTENSIONS: Record<AppKind, string[]> = {
  text: ['tto', 'docx'],
  sheet: ['tts', 'xlsx', 'csv'],
  slides: ['ttp'],
};

export const OPENABLE_EXTENSIONS = Object.values(APP_EXTENSIONS).flat();

/** Les formats propres, reconnus par leur extension (documents que la fenêtre a le droit de réécrire). */
export const NATIVE_EXTENSION_PATTERN = /\.(tto|tts|ttp)$/i;

/** Extensions retirées du nom d'un document pour en faire son titre. */
export const KNOWN_EXTENSIONS = [...Object.values(KIND_INFO).map((k) => k.extension), 'pdf'];

export function isSaveKind(value: unknown): value is SaveKind {
  return typeof value === 'string' && Object.hasOwn(KIND_INFO, value);
}

export function isAppKind(value: unknown): value is AppKind {
  return value === 'text' || value === 'sheet' || value === 'slides';
}

/** L'application qui ouvre ce fichier, d'après son extension ; null si aucune ne le sait. */
export function appForFileName(nom: string): AppKind | null {
  const extension = /\.([A-Za-z0-9]+)$/.exec(nom)?.[1]?.toLowerCase();
  if (!extension) return null;
  for (const app of ['text', 'sheet', 'slides'] as const) if (APP_EXTENSIONS[app].includes(extension)) return app;
  return null;
}
