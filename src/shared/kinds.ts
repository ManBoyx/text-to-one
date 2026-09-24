export type SaveKind = 'tto' | 'docx' | 'html' | 'txt' | 'md';

export const KIND_INFO: Record<SaveKind, { label: string; extension: string }> = {
  tto: { label: 'Document Text to One', extension: 'tto' },
  docx: { label: 'Document Word', extension: 'docx' },
  html: { label: 'Page web', extension: 'html' },
  txt: { label: 'Texte brut', extension: 'txt' },
  md: { label: 'Markdown', extension: 'md' },
};

/** Extensions retirées du nom d'un document pour en faire son titre. */
export const KNOWN_EXTENSIONS = ['tto', 'docx', 'html', 'txt', 'md', 'pdf'];

export function isSaveKind(value: unknown): value is SaveKind {
  return typeof value === 'string' && Object.hasOwn(KIND_INFO, value);
}
