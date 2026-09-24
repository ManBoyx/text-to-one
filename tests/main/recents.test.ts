import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RecentsStore, fileStorage, type RecentsStorage } from '../../src/main/recents';

function mémoire(initial: string | null = null): RecentsStorage & { contenu: string | null } {
  const stockage = {
    contenu: initial,
    read: async () => stockage.contenu,
    write: async (texte: string) => {
      stockage.contenu = texte;
    },
  };
  return stockage;
}

describe('documents récents', () => {
  it('met le plus récent en premier, sans doublon', async () => {
    const magasin = new RecentsStore(mémoire());
    await magasin.add('/a.tto', 'a.tto');
    await magasin.add('/b.tto', 'b.tto');
    await magasin.add('/a.tto', 'a.tto');
    expect(magasin.entries()).toEqual([{ path: '/a.tto', name: 'a.tto' }, { path: '/b.tto', name: 'b.tto' }]);
  });

  it('garde au plus dix documents', async () => {
    const magasin = new RecentsStore(mémoire());
    for (let i = 0; i < 15; i++) await magasin.add(`/d${i}.tto`, `d${i}.tto`);
    expect(magasin.entries()).toHaveLength(10);
    expect(magasin.entries()[0].path).toBe('/d14.tto');
  });

  it('se souvient après un redémarrage', async () => {
    const stockage = mémoire();
    await new RecentsStore(stockage).add('/a.tto', 'a.tto');
    const relu = new RecentsStore(stockage);
    await relu.load();
    expect(relu.has('/a.tto')).toBe(true);
    expect(relu.has('/z.tto')).toBe(false);
  });

  it('oublie un document retiré', async () => {
    const magasin = new RecentsStore(mémoire());
    await magasin.add('/a.tto', 'a.tto');
    await magasin.remove('/a.tto');
    expect(magasin.entries()).toEqual([]);
  });

  it('ignore un fichier de récents abîmé', async () => {
    for (const contenu of ['{pas du json', '{"a":1}', 'null', '[1,"x",{"path":"/ok.tto","name":"ok.tto"},{"path":3}]']) {
      const magasin = new RecentsStore(mémoire(contenu));
      await magasin.load();
      expect(magasin.entries().every((e) => typeof e.path === 'string' && typeof e.name === 'string')).toBe(true);
    }
    const partiel = new RecentsStore(mémoire('[1,"x",{"path":"/ok.tto","name":"ok.tto"},{"path":3}]'));
    await partiel.load();
    expect(partiel.entries()).toEqual([{ path: '/ok.tto', name: 'ok.tto' }]);
  });

  it("continue de fonctionner quand le disque refuse d'écrire", async () => {
    const magasin = new RecentsStore({ read: async () => null, write: async () => Promise.reject(new Error('disque plein')) });
    await expect(magasin.add('/a.tto', 'a.tto')).resolves.toBeUndefined();
    expect(magasin.has('/a.tto')).toBe(true);
  });

  it('écrit dans un vrai fichier', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'tto-recents-'));
    try {
      const chemin = join(dossier, 'recents.json');
      const stockage = fileStorage(chemin);
      expect(await stockage.read()).toBeNull();
      await new RecentsStore(stockage).add('/a.tto', 'a.tto');
      expect(JSON.parse(readFileSync(chemin, 'utf8'))).toEqual([{ path: '/a.tto', name: 'a.tto' }]);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});
