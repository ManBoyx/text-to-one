import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { writeFileAtomic } from './files';

export interface RecoveryItem {
  id: string;
  name: string;
  bytes: Uint8Array;
}

const ID_VALIDE = /^[A-Za-z0-9-]{8,64}$/;

function vérifier(id: string): void {
  if (!ID_VALIDE.test(id)) throw new Error('Identifiant de document invalide.');
}

/** Les brouillons écrits toutes les 30 secondes : ils servent seulement après une fermeture inattendue. */
export class RecoveryStore {
  constructor(private readonly dossier: string) {}

  async write(id: string, nom: string, octets: Uint8Array): Promise<void> {
    vérifier(id);
    await fs.mkdir(this.dossier, { recursive: true });
    await writeFileAtomic(join(this.dossier, `${id}.tto`), octets);
    await writeFileAtomic(join(this.dossier, `${id}.json`), new TextEncoder().encode(JSON.stringify({ name: nom })));
  }

  async clear(id: string): Promise<void> {
    vérifier(id);
    await fs.rm(join(this.dossier, `${id}.tto`), { force: true });
    await fs.rm(join(this.dossier, `${id}.json`), { force: true });
  }

  async list(): Promise<RecoveryItem[]> {
    const noms = await fs.readdir(this.dossier).catch(() => [] as string[]);
    const brouillons: RecoveryItem[] = [];
    for (const nom of noms.filter((n) => n.endsWith('.tto'))) {
      const id = nom.slice(0, -4);
      if (!ID_VALIDE.test(id)) continue;
      try {
        const bytes = new Uint8Array(await fs.readFile(join(this.dossier, nom)));
        let titre = 'Document récupéré';
        try {
          const meta = JSON.parse(await fs.readFile(join(this.dossier, `${id}.json`), 'utf8')) as { name?: unknown };
          if (typeof meta.name === 'string' && meta.name) titre = meta.name;
        } catch {
          // Sans fichier de nom, le titre par défaut convient.
        }
        brouillons.push({ id, name: titre, bytes });
      } catch {
        // Un brouillon illisible est simplement ignoré.
      }
    }
    return brouillons;
  }

  async clearAll(): Promise<void> {
    await fs.rm(this.dossier, { recursive: true, force: true });
  }
}
