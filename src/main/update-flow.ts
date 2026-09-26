import type { MessageBoxOptions } from 'electron';
import type { MiseÀJour } from '../shared/update';
import type { StockageMisesÀJour } from './update-settings';
import { ErreurMiseÀJour, appImageRemplaçable, chercherMiseÀJour, remplacerAppImage } from './updates';

export interface DépendancesMisesÀJour {
  versionInstallée: string;
  titre: string;
  stockage: StockageMisesÀJour;
  /** Le fichier AppImage en cours d'exécution, s'il y en a un. */
  appImage: string | undefined;
  afficher(options: MessageBoxOptions): Promise<{ response: number }>;
  ouvrirPage(url: string): void;
  /** Avancement du téléchargement de 0 à 1 (barre de progression de la fenêtre) ; -1 pour l'effacer. */
  progression(fraction: number): void;
  /** Relance l'application depuis ce fichier. */
  redémarrer(fichier: string): void;
  chercher?: typeof fetch;
}

/** Les notes de la version, raccourcies pour tenir dans une boîte de dialogue. */
const résuméDesNotes = (notes: string): string => {
  const propre = notes.replace(/\r/g, '').replace(/[#*`>]/g, '').trim();
  return propre.length > 700 ? `${propre.slice(0, 700).trimEnd()}…` : propre;
};

async function proposer(d: DépendancesMisesÀJour, m: MiseÀJour, installable: boolean): Promise<'installer' | 'page' | 'plus-tard' | 'ignorer'> {
  const boutons = installable ? ['Mettre à jour', 'Voir la page', 'Plus tard', 'Ignorer cette version'] : ['Télécharger', 'Plus tard', 'Ignorer cette version'];
  const { response } = await d.afficher({
    type: 'info',
    title: 'Mise à jour',
    message: `La version ${m.version} de ${d.titre} est disponible.`,
    detail: `Tu as la version ${d.versionInstallée}.${m.notes ? `\n\n${résuméDesNotes(m.notes)}` : ''}${installable ? '\n\nLa mise à jour remplace ce fichier AppImage ; tes documents ne sont pas touchés.' : ''}`,
    buttons: boutons,
    defaultId: 0,
    cancelId: boutons.length - 2,
    noLink: true,
  });
  if (installable) return (['installer', 'page', 'plus-tard', 'ignorer'] as const)[response] ?? 'plus-tard';
  return (['page', 'plus-tard', 'ignorer'] as const)[response] ?? 'plus-tard';
}

/**
 * Cherche une nouvelle version et la propose. `manuel` : l'utilisateur l'a demandé (on répond toujours, même
 * « vous êtes à jour » ou une erreur) ; sinon c'est la vérification du démarrage, silencieuse sauf nouveauté.
 */
export async function vérifierMisesÀJour(d: DépendancesMisesÀJour, manuel: boolean): Promise<void> {
  let trouvée: MiseÀJour | null;
  try {
    trouvée = await chercherMiseÀJour(d.versionInstallée, d.chercher);
  } catch (erreur) {
    if (manuel) await d.afficher({ type: 'warning', title: 'Mise à jour', message: 'La recherche de mise à jour a échoué.', detail: (erreur as Error).message, buttons: ['Fermer'] });
    return;
  }
  if (!manuel) await d.stockage.modifier({ dernière: Date.now() });
  if (!trouvée) {
    if (manuel) await d.afficher({ type: 'info', title: 'Mise à jour', message: `${d.titre} est à jour.`, detail: `Version ${d.versionInstallée}.`, buttons: ['Fermer'] });
    return;
  }
  if (!manuel && d.stockage.lire().ignorée === trouvée.version) return;

  const fichier = trouvée.appImage;
  const installable = !!fichier && !!fichier.sha256 && (await appImageRemplaçable(d.appImage));
  const choix = await proposer(d, trouvée, installable);
  if (choix === 'ignorer') return d.stockage.modifier({ ignorée: trouvée.version });
  if (choix === 'page') return d.ouvrirPage(trouvée.page);
  if (choix !== 'installer' || !fichier || !d.appImage) return;

  try {
    await remplacerAppImage(fichier, d.appImage, d.progression, d.chercher);
  } catch (erreur) {
    d.progression(-1);
    const { response } = await d.afficher({
      type: 'error',
      title: 'Mise à jour',
      message: "La mise à jour n'a pas pu être installée.",
      detail: `${erreur instanceof ErreurMiseÀJour ? erreur.message : String(erreur)}\n\nTon application n'a pas été modifiée.`,
      buttons: ['Ouvrir la page de téléchargement', 'Fermer'],
      defaultId: 1,
    });
    if (response === 0) d.ouvrirPage(trouvée.page);
    return;
  }
  d.progression(-1);
  const { response } = await d.afficher({
    type: 'info',
    title: 'Mise à jour',
    message: `La version ${trouvée.version} est installée.`,
    detail: 'Redémarre Text to One pour l’utiliser. Les documents non enregistrés te seront proposés à l’enregistrement.',
    buttons: ['Redémarrer maintenant', 'Plus tard'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) d.redémarrer(d.appImage);
}
