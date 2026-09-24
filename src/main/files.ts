import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { OpenedFile } from '../shared/bridge';

export const TAILLE_MAX_DOCUMENT = 500 * 1024 * 1024;

/** Traduit une erreur du disque en phrase compréhensible. */
export function describeFsError(erreur: unknown): string {
  const code = (erreur as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case 'ENOENT':
      return 'Le fichier ou le dossier est introuvable.';
    case 'EACCES':
    case 'EPERM':
      return "Accès refusé : tu n'as pas le droit d'écrire ici.";
    case 'ENOSPC':
      return 'Le disque est plein.';
    case 'EROFS':
      return 'Ce dossier est en lecture seule.';
    case 'EBUSY':
      return 'Le fichier est utilisé par un autre programme.';
    case 'EISDIR':
      return "Ce chemin est un dossier, pas un fichier.";
    default:
      return erreur instanceof Error && erreur.message ? erreur.message : 'Erreur inconnue.';
  }
}

/** Écrit dans un fichier temporaire voisin puis le renomme : l'ancien fichier n'est jamais laissé à moitié écrit. */
export async function writeFileAtomic(chemin: string, octets: Uint8Array): Promise<void> {
  const temporaire = join(dirname(chemin), `.${basename(chemin)}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temporaire, octets);
    await fs.rename(temporaire, chemin);
  } catch (erreur) {
    await fs.rm(temporaire, { force: true }).catch(() => undefined);
    throw erreur;
  }
}

export async function readDocumentFile(chemin: string): Promise<OpenedFile> {
  const infos = await fs.stat(chemin);
  if (!infos.isFile()) throw Object.assign(new Error("Ce chemin n'est pas un fichier."), { code: 'EISDIR' });
  if (infos.size > TAILLE_MAX_DOCUMENT) throw new Error('Ce fichier est trop volumineux pour être ouvert.');
  const contenu = await fs.readFile(chemin);
  // Une copie propre : la mémoire partagée du tampon ne doit pas partir avec le message.
  return { path: chemin, name: basename(chemin), bytes: new Uint8Array(contenu) };
}

/** Un nom de fichier valable sous Windows comme sous Linux. */
export function sanitizeFileName(nom: string, défaut = 'Document sans titre'): string {
  const propre = nom
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120);
  if (!propre) return défaut;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(propre) ? `_${propre}` : propre;
}

/** Le chemin choisi doit finir par l'extension du type enregistré ; on l'ajoute sinon. */
export function ensureExtension(chemin: string, extension: string): string {
  return chemin.toLowerCase().endsWith(`.${extension}`) ? chemin : `${chemin}.${extension}`;
}
