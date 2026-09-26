import { promises as fs } from 'node:fs';

export interface RéglagesMisesÀJour {
  /** Vérifier une fois par jour au démarrage. */
  auto: boolean;
  /** Date (ms) de la dernière vérification automatique. */
  dernière: number;
  /** Version que l'utilisateur ne veut plus qu'on lui propose. */
  ignorée: string;
}

const DÉFAUT: RéglagesMisesÀJour = { auto: true, dernière: 0, ignorée: '' };

/** Les réglages des mises à jour, dans un petit fichier JSON du dossier de données. Un fichier absent ou abîmé donne les réglages par défaut. */
export class StockageMisesÀJour {
  private valeurs: RéglagesMisesÀJour = { ...DÉFAUT };

  constructor(private readonly chemin: string) {}

  async charger(): Promise<void> {
    try {
      const brut = JSON.parse(await fs.readFile(this.chemin, 'utf8')) as Partial<RéglagesMisesÀJour>;
      this.valeurs = {
        auto: brut.auto !== false,
        dernière: typeof brut.dernière === 'number' && Number.isFinite(brut.dernière) ? brut.dernière : 0,
        ignorée: typeof brut.ignorée === 'string' ? brut.ignorée.slice(0, 40) : '',
      };
    } catch {
      this.valeurs = { ...DÉFAUT };
    }
  }

  lire(): RéglagesMisesÀJour {
    return { ...this.valeurs };
  }

  async modifier(patch: Partial<RéglagesMisesÀJour>): Promise<void> {
    this.valeurs = { ...this.valeurs, ...patch };
    await fs.writeFile(this.chemin, JSON.stringify(this.valeurs), 'utf8').catch(() => undefined);
  }

  /** Vrai si la dernière vérification date d'au moins un jour. */
  àVérifier(maintenant = Date.now()): boolean {
    return this.valeurs.auto && maintenant - this.valeurs.dernière >= 24 * 3600 * 1000;
  }
}
