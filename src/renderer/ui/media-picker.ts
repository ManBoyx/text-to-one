import { MEDIA_ACCEPT, MEDIA_MAX_BYTES, titreDeFichier, typeDeMédia, type GenreMédia } from '../../shared/media';
import type { Notice } from '../document-controller';
import { fr } from '../fr';

export interface MédiaChoisi {
  /** Adresse « data: » du fichier, avec un type normalisé. */
  src: string;
  title: string;
  genre: GenreMédia;
}

function lireEnAdresse(fichier: File): Promise<string> {
  return new Promise((résoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => résoudre(String(lecteur.result));
    lecteur.onerror = () => rejeter(lecteur.error);
    lecteur.readAsDataURL(fichier);
  });
}

/** Lit un fichier son ou vidéo ; null (avec un message) s'il est trop gros ou d'un type inconnu. */
export async function lireMédia(fichier: File, notify: (notice: Notice) => void): Promise<MédiaChoisi | null> {
  const type = typeDeMédia(fichier.name, fichier.type);
  if (!type) {
    notify({ kind: 'error', text: fr.media.unsupported });
    return null;
  }
  if (fichier.size > MEDIA_MAX_BYTES) {
    notify({ kind: 'error', text: fr.media.tooBig });
    return null;
  }
  const brut = await lireEnAdresse(fichier);
  // Le système annonce parfois un type approximatif : on écrit celui que l'on a reconnu.
  const src = `data:${type.mime};base64,${brut.slice(brut.indexOf(',') + 1)}`;
  return { src, title: titreDeFichier(fichier.name) || fr.media.untitled, genre: type.genre };
}

/** Les fichiers de la liste que l'on sait lire comme son ou vidéo. */
export const fichiersMédia = (liste: FileList | null | undefined): File[] => Array.from(liste ?? []).filter((f) => typeDeMédia(f.name, f.type) !== null);

/** Ouvre le sélecteur de fichiers ; null si l'utilisateur annule ou si le fichier est refusé. */
export function choisirMédia(notify: (notice: Notice) => void): Promise<MédiaChoisi | null> {
  return new Promise((résoudre) => {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = MEDIA_ACCEPT;
    champ.hidden = true;
    const finir = (valeur: MédiaChoisi | null) => {
      champ.remove();
      résoudre(valeur);
    };
    champ.addEventListener('change', async () => {
      const fichier = champ.files?.[0];
      finir(fichier ? await lireMédia(fichier, notify) : null);
    });
    champ.addEventListener('cancel', () => finir(null));
    document.body.append(champ);
    champ.click();
  });
}
