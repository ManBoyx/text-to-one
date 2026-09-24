import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecoveryStore } from '../../src/main/recovery';

let dossier: string;
let magasin: RecoveryStore;
beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'tto-recovery-'));
  magasin = new RecoveryStore(join(dossier, 'brouillons'));
});
afterEach(() => rmSync(dossier, { recursive: true, force: true }));

const ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('récupération après plantage', () => {
  it('écrit, relit et efface un brouillon', async () => {
    await magasin.write(ID, 'Mon rapport', new Uint8Array([1, 2, 3]));
    const liste = await magasin.list();
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ id: ID, name: 'Mon rapport' });
    expect([...liste[0].bytes]).toEqual([1, 2, 3]);
    await magasin.clear(ID);
    expect(await magasin.list()).toEqual([]);
  });

  it('remplace le brouillon précédent du même document', async () => {
    await magasin.write(ID, 'v1', new Uint8Array([1]));
    await magasin.write(ID, 'v2', new Uint8Array([2, 2]));
    const [brouillon] = await magasin.list();
    expect(brouillon.name).toBe('v2');
    expect([...brouillon.bytes]).toEqual([2, 2]);
  });

  it('refuse un identifiant qui pourrait sortir du dossier', async () => {
    for (const mauvais of ['../evil', '..\\evil', 'a/b', '', 'x', '../../etc/passwd', 'a'.repeat(200)]) {
      await expect(magasin.write(mauvais, 'x', new Uint8Array([1])), mauvais).rejects.toThrow(/identifiant/i);
      await expect(magasin.clear(mauvais), mauvais).rejects.toThrow(/identifiant/i);
    }
    expect(readdirSync(dossier)).toEqual([]);
  });

  it('ignore les fichiers étrangers et donne un nom aux brouillons sans nom', async () => {
    await magasin.write(ID, 'Nom', new Uint8Array([1]));
    const brouillons = join(dossier, 'brouillons');
    writeFileSync(join(brouillons, 'notes.txt'), 'bonjour');
    writeFileSync(join(brouillons, '00000000-0000-0000-0000-000000000000.tto'), Buffer.from([7]));
    const liste = await magasin.list();
    expect(liste.map((b) => b.name).sort()).toEqual(['Document récupéré', 'Nom']);
  });

  it('efface tout', async () => {
    await magasin.write(ID, 'a', new Uint8Array([1]));
    await magasin.clearAll();
    expect(await magasin.list()).toEqual([]);
  });

  it("n'échoue pas quand il n'y a encore rien", async () => {
    expect(await magasin.list()).toEqual([]);
    await expect(magasin.clearAll()).resolves.toBeUndefined();
  });
});
