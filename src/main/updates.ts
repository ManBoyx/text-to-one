import { createHash } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PRÉFIXE_TÉLÉCHARGEMENT, TAILLE_MAX_MISE_À_JOUR, URL_API_DERNIÈRE_VERSION, analyserVersion, type FichierMiseÀJour, type MiseÀJour } from '../shared/update';

type Fetch = typeof fetch;

export class ErreurMiseÀJour extends Error {}

/** Demande à GitHub la dernière version publiée ; null si l'on est à jour. Une réponse absente ou illisible est une erreur. */
export async function chercherMiseÀJour(versionInstallée: string, chercher: Fetch = fetch): Promise<MiseÀJour | null> {
  let réponse: Response;
  try {
    réponse = await chercher(URL_API_DERNIÈRE_VERSION, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Text-to-One' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ErreurMiseÀJour("Impossible de joindre GitHub. Vérifie ta connexion à Internet.");
  }
  if (réponse.status === 404) return null; // aucune version publiée pour l'instant
  if (!réponse.ok) throw new ErreurMiseÀJour(`GitHub a répondu une erreur (${réponse.status}).`);
  let json: unknown;
  try {
    json = await réponse.json();
  } catch {
    throw new ErreurMiseÀJour('La réponse de GitHub est illisible.');
  }
  return analyserVersion(json, versionInstallée);
}

/** Vrai si l'on peut remplacer ce fichier AppImage : il existe et son dossier est modifiable. */
export async function appImageRemplaçable(chemin: string | undefined): Promise<boolean> {
  if (!chemin || !/\.AppImage$/i.test(chemin)) return false;
  try {
    await fs.access(chemin);
    await fs.access(dirname(chemin), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Télécharge le fichier, vérifie son empreinte SHA-256 puis le met à la place de l'ancien (renommage : l'ancien
 * fichier, peut-être en cours d'utilisation, n'est jamais modifié en place). Sans empreinte fournie par GitHub, on refuse.
 */
export async function remplacerAppImage(fichier: FichierMiseÀJour, cible: string, surProgrès: (fraction: number) => void, chercher: Fetch = fetch): Promise<void> {
  if (!fichier.url.startsWith(PRÉFIXE_TÉLÉCHARGEMENT) || fichier.size > TAILLE_MAX_MISE_À_JOUR) throw new ErreurMiseÀJour('Ce fichier de mise à jour est refusé.');
  if (!fichier.sha256) throw new ErreurMiseÀJour("GitHub ne donne pas l'empreinte de ce fichier : impossible de vérifier qu'il est intact.");
  const temporaire = `${cible}.telechargement`;
  try {
    const réponse = await chercher(fichier.url, { headers: { 'User-Agent': 'Text-to-One' }, redirect: 'follow' });
    if (!réponse.ok || !réponse.body) throw new ErreurMiseÀJour(`Le téléchargement a échoué (${réponse.status}).`);
    const empreinte = createHash('sha256');
    let reçu = 0;
    const mesure = new Transform({
      transform(morceau: Buffer, _encodage, fini) {
        reçu += morceau.length;
        if (reçu > TAILLE_MAX_MISE_À_JOUR || reçu > fichier.size) return fini(new ErreurMiseÀJour('Le fichier reçu est plus gros que prévu.'));
        empreinte.update(morceau);
        surProgrès(Math.min(1, reçu / fichier.size));
        fini(null, morceau);
      },
    });
    await pipeline(Readable.fromWeb(réponse.body as never), mesure, createWriteStream(temporaire, { mode: 0o755 }));
    if (reçu !== fichier.size) throw new ErreurMiseÀJour('Le téléchargement est incomplet.');
    if (empreinte.digest('hex') !== fichier.sha256) throw new ErreurMiseÀJour("Le fichier téléchargé est abîmé : son empreinte ne correspond pas. Rien n'a été modifié.");
    await fs.chmod(temporaire, 0o755);
    await fs.rename(temporaire, cible);
  } catch (erreur) {
    await fs.rm(temporaire, { force: true });
    throw erreur instanceof ErreurMiseÀJour ? erreur : new ErreurMiseÀJour(`Le téléchargement a échoué : ${(erreur as Error).message}`);
  }
}
