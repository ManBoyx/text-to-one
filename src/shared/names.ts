import { KNOWN_EXTENSIONS } from './kinds';

/** Nom du fichier sans son dossier, que le chemin vienne de Windows (\) ou de Linux (/). */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Retire seulement les extensions connues : « Rapport v2.1 » reste intact. */
export function stripExtension(name: string): string {
  const morceaux = /^(.+)\.([A-Za-z0-9]+)$/.exec(name);
  return morceaux && KNOWN_EXTENSIONS.includes(morceaux[2].toLowerCase()) ? morceaux[1] : name;
}
