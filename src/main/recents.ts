import { promises as fs } from 'node:fs';
import type { RecentEntry } from '../shared/bridge';
import { writeFileAtomic } from './files';

export interface RecentsStorage {
  read(): Promise<string | null>;
  write(contenu: string): Promise<void>;
}

const estValide = (valeur: unknown): valeur is RecentEntry =>
  typeof valeur === 'object' &&
  valeur !== null &&
  typeof (valeur as RecentEntry).path === 'string' &&
  typeof (valeur as RecentEntry).name === 'string';

/** La liste des derniers documents ouverts ou enregistrés, conservée d'une session à l'autre. */
export class RecentsStore {
  private liste: RecentEntry[] = [];

  constructor(
    private readonly stockage: RecentsStorage,
    private readonly max = 10,
  ) {}

  async load(): Promise<void> {
    try {
      const brut = await this.stockage.read();
      const lu: unknown = brut ? JSON.parse(brut) : [];
      this.liste = Array.isArray(lu) ? lu.filter(estValide).slice(0, this.max) : [];
    } catch {
      this.liste = [];
    }
  }

  entries(): RecentEntry[] {
    return [...this.liste];
  }

  has(chemin: string): boolean {
    return this.liste.some((e) => e.path === chemin);
  }

  async add(chemin: string, nom: string): Promise<void> {
    this.liste = [{ path: chemin, name: nom }, ...this.liste.filter((e) => e.path !== chemin)].slice(0, this.max);
    await this.enregistrer();
  }

  async remove(chemin: string): Promise<void> {
    this.liste = this.liste.filter((e) => e.path !== chemin);
    await this.enregistrer();
  }

  private async enregistrer(): Promise<void> {
    try {
      await this.stockage.write(JSON.stringify(this.liste));
    } catch {
      // La liste des récents n'est pas essentielle : si le disque refuse, on continue avec celle de la mémoire.
    }
  }
}

export function fileStorage(chemin: string): RecentsStorage {
  return {
    read: () => fs.readFile(chemin, 'utf8').catch(() => null),
    write: (contenu) => writeFileAtomic(chemin, new TextEncoder().encode(contenu)),
  };
}
