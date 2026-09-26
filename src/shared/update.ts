/** Le dépôt d'où viennent les mises à jour : les versions publiées y sont visibles de tout le monde. */
export const DÉPÔT = 'ManBoyx/text-to-one';
export const URL_API_DERNIÈRE_VERSION = `https://api.github.com/repos/${DÉPÔT}/releases/latest`;
export const PRÉFIXE_TÉLÉCHARGEMENT = `https://github.com/${DÉPÔT}/releases/download/`;
/** Un fichier de mise à jour plus gros que cela est refusé. */
export const TAILLE_MAX_MISE_À_JOUR = 500 * 1024 * 1024;

export interface FichierMiseÀJour {
  name: string;
  url: string;
  size: number;
  /** Empreinte SHA-256 en hexadécimal, donnée par GitHub ; null si elle manque. */
  sha256: string | null;
}

export interface MiseÀJour {
  version: string;
  notes: string;
  /** La page de la version, où l'on peut télécharger à la main. */
  page: string;
  /** Le fichier AppImage de la version, s'il y en a un. */
  appImage: FichierMiseÀJour | null;
}

/** « v1.2.3 » ou « 1.2.3-beta.1 » → [1, 2, 3] et le suffixe de préversion ; null si ce n'est pas un numéro de version. */
function lireVersion(texte: string): { nombres: [number, number, number]; préversion: string } | null {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(texte.trim());
  return m ? { nombres: [Number(m[1]), Number(m[2]), Number(m[3])], préversion: m[4] ?? '' } : null;
}

/** Positif si `a` est plus récente que `b`, négatif si elle est plus ancienne, 0 si elles sont égales ; NaN si l'une est illisible. */
export function comparerVersions(a: string, b: string): number {
  const x = lireVersion(a);
  const y = lireVersion(b);
  if (!x || !y) return NaN;
  for (let i = 0; i < 3; i++) if (x.nombres[i] !== y.nombres[i]) return x.nombres[i] - y.nombres[i];
  if (x.préversion === y.préversion) return 0;
  if (!x.préversion) return 1; // 1.0.0 est plus récente que 1.0.0-beta
  if (!y.préversion) return -1;
  return x.préversion < y.préversion ? -1 : 1;
}

const estTexte = (v: unknown): v is string => typeof v === 'string';

/** Ne garde qu'un fichier qui vient bien du dépôt, en https, avec une taille raisonnable. */
function lireFichier(brut: unknown): FichierMiseÀJour | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const f = brut as Record<string, unknown>;
  if (!estTexte(f.name) || !estTexte(f.browser_download_url) || typeof f.size !== 'number') return null;
  if (!f.browser_download_url.startsWith(PRÉFIXE_TÉLÉCHARGEMENT) || f.size <= 0 || f.size > TAILLE_MAX_MISE_À_JOUR) return null;
  const empreinte = estTexte(f.digest) ? /^sha256:([0-9a-f]{64})$/i.exec(f.digest)?.[1].toLowerCase() : undefined;
  return { name: f.name, url: f.browser_download_url, size: f.size, sha256: empreinte ?? null };
}

/**
 * Lit la réponse de GitHub pour « dernière version » : renvoie la mise à jour si elle est plus récente que la
 * version installée, sinon null. Tout ce qui est inattendu (brouillon, préversion, numéro illisible) donne null.
 */
export function analyserVersion(réponse: unknown, versionInstallée: string): MiseÀJour | null {
  if (typeof réponse !== 'object' || réponse === null) return null;
  const r = réponse as Record<string, unknown>;
  if (r.draft === true || r.prerelease === true || !estTexte(r.tag_name)) return null;
  if (!(comparerVersions(r.tag_name, versionInstallée) > 0)) return null;
  const page = estTexte(r.html_url) && r.html_url.startsWith(`https://github.com/${DÉPÔT}/`) ? r.html_url : `https://github.com/${DÉPÔT}/releases`;
  const fichiers = (Array.isArray(r.assets) ? r.assets : []).map(lireFichier).filter((f): f is FichierMiseÀJour => f !== null);
  return {
    version: r.tag_name.replace(/^v/, ''),
    notes: estTexte(r.body) ? r.body.slice(0, 4000) : '',
    page,
    appImage: fichiers.find((f) => /\.AppImage$/i.test(f.name)) ?? null,
  };
}
