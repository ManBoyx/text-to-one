import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeFsError, ensureExtension, readDocumentFile, sanitizeFileName, writeFileAtomic } from '../../src/main/files';

let dossier: string;
beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), 'tto-test-'));
});
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

const temporaires = () => readdirSync(dossier).filter((nom) => nom.endsWith('.tmp'));

describe('messages d\'erreur de fichier', () => {
  it('explique les cas courants en français', () => {
    const avecCode = (code: string) => Object.assign(new Error('x'), { code });
    expect(describeFsError(avecCode('ENOENT'))).toMatch(/introuvable/);
    expect(describeFsError(avecCode('EACCES'))).toMatch(/Accès refusé/);
    expect(describeFsError(avecCode('EPERM'))).toMatch(/Accès refusé/);
    expect(describeFsError(avecCode('ENOSPC'))).toMatch(/disque est plein/);
    expect(describeFsError(avecCode('EROFS'))).toMatch(/lecture seule/);
    expect(describeFsError(avecCode('EBUSY'))).toMatch(/autre programme/);
    expect(describeFsError(new Error('autre chose'))).toBe('autre chose');
    expect(describeFsError('bizarre')).toBe('Erreur inconnue.');
  });
});

describe('écriture atomique', () => {
  it('écrit puis remplace un fichier, sans laisser de fichier temporaire', async () => {
    const chemin = join(dossier, 'Rapport été 2025.tto');
    await writeFileAtomic(chemin, new Uint8Array([1, 2, 3]));
    await writeFileAtomic(chemin, new Uint8Array([4, 5]));
    expect([...readFileSync(chemin)]).toEqual([4, 5]);
    expect(temporaires()).toEqual([]);
  });

  it("échoue proprement quand le dossier n'existe pas", async () => {
    await expect(writeFileAtomic(join(dossier, 'absent', 'a.tto'), new Uint8Array([1]))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(temporaires()).toEqual([]);
  });

  it("ne détruit jamais l'existant quand le remplacement échoue", async () => {
    const cible = join(dossier, 'un-dossier');
    mkdirSync(cible);
    writeFileSync(join(cible, 'contenu.txt'), 'gardé');
    await expect(writeFileAtomic(cible, new Uint8Array([1]))).rejects.toBeDefined();
    expect(readFileSync(join(cible, 'contenu.txt'), 'utf8')).toBe('gardé');
    expect(temporaires()).toEqual([]);
  });
});

describe('lecture', () => {
  it('lit un fichier dont le nom a des accents et des espaces', async () => {
    const chemin = join(dossier, 'Léa – été.tto');
    writeFileSync(chemin, Buffer.from([9, 8, 7]));
    const fichier = await readDocumentFile(chemin);
    expect(fichier.name).toBe('Léa – été.tto');
    expect(fichier.path).toBe(chemin);
    expect([...fichier.bytes]).toEqual([9, 8, 7]);
    expect(fichier.bytes.buffer.byteLength).toBe(3);
  });

  it('refuse un dossier et un fichier absent, avec un message clair', async () => {
    await expect(readDocumentFile(dossier)).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(readDocumentFile(join(dossier, 'absent.tto'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('noms de fichiers', () => {
  it('garde les noms normaux, accents compris', () => {
    expect(sanitizeFileName('Rapport été 2025.tto')).toBe('Rapport été 2025.tto');
  });

  it('remplace les caractères interdits sous Windows', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j.tto')).toBe('a-b-c-d-e-f-g-h-i-j.tto');
    expect(sanitizeFileName('tab\tet\nretour')).toBe('tab-et-retour');
  });

  it('ne laisse ni nom vide, ni point ou espace final, ni nom réservé', () => {
    expect(sanitizeFileName('')).toBe('Document sans titre');
    expect(sanitizeFileName('  ...  ')).toBe('Document sans titre');
    expect(sanitizeFileName('CON.tto')).toBe('_CON.tto');
    expect(sanitizeFileName('nul')).toBe('_nul');
    expect(sanitizeFileName('lpt1.docx')).toBe('_lpt1.docx');
    expect(sanitizeFileName('Rapport final. ')).toBe('Rapport final');
  });

  it('raccourcit les noms démesurés', () => {
    expect(sanitizeFileName('a'.repeat(500)).length).toBe(120);
  });

  it("ajoute l'extension quand il en manque, sans doubler celle qui existe", () => {
    expect(ensureExtension('/docs/a', 'tto')).toBe('/docs/a.tto');
    expect(ensureExtension('/docs/a.tto', 'tto')).toBe('/docs/a.tto');
    expect(ensureExtension('/docs/A.TTO', 'tto')).toBe('/docs/A.TTO');
    expect(ensureExtension('/docs/rapport.v2', 'tto')).toBe('/docs/rapport.v2.tto');
    expect(ensureExtension('C:\\Users\\Léa\\Docs\\a.docx', 'tto')).toBe('C:\\Users\\Léa\\Docs\\a.docx.tto');
  });
});
