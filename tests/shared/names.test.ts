import { describe, expect, it } from 'vitest';
import { KIND_INFO, isSaveKind } from '../../src/shared/kinds';
import { fileNameOf, stripExtension } from '../../src/shared/names';

describe('noms de fichiers', () => {
  it("retire seulement les extensions que Text to One connaît", () => {
    expect(stripExtension('Rapport été 2025.tto')).toBe('Rapport été 2025');
    expect(stripExtension('a.docx')).toBe('a');
    expect(stripExtension('MAJUSCULES.TTO')).toBe('MAJUSCULES');
    expect(stripExtension('archive.tar.tto')).toBe('archive.tar');
    expect(stripExtension('notes')).toBe('notes');
    expect(stripExtension('Rapport v2.1')).toBe('Rapport v2.1');
    expect(stripExtension('.tto')).toBe('.tto');
  });

  it('extrait le nom du fichier, que le chemin vienne de Windows ou de Linux', () => {
    expect(fileNameOf('C:\\Users\\Léa\\Docs\\a.b.tto')).toBe('a.b.tto');
    expect(fileNameOf('/home/léa/mon doc.tto')).toBe('mon doc.tto');
    expect(fileNameOf('simple.tto')).toBe('simple.tto');
  });

  it('reconnaît les types de fichiers enregistrables', () => {
    expect(isSaveKind('docx')).toBe(true);
    expect(isSaveKind('pdf')).toBe(false);
    expect(isSaveKind('__proto__')).toBe(false);
    expect(KIND_INFO.tto.extension).toBe('tto');
  });
});
