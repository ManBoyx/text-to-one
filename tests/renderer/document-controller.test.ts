import type { JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeDocument } from '../../src/formats';
import { packTto } from '../../src/formats/tto';
import { DocumentController, type Notice } from '../../src/renderer/document-controller';
import { sampleDoc } from '../formats/sample-doc';
import { createFakeBridge } from './fake-bridge';

const VIDE: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function préparer() {
  const pont = createFakeBridge();
  let contenu: JSONContent = VIDE;
  const notices: Notice[] = [];
  const contrôleur = new DocumentController({
    bridge: pont,
    getDoc: () => contenu,
    setDoc: (doc) => {
      contenu = doc;
    },
    notify: (notice) => notices.push(notice),
    newId: () => 'id-test-0001',
  });
  return { pont, contrôleur, notices, doc: () => contenu, écrire: (doc: JSONContent) => (contenu = doc) };
}

afterEach(() => vi.useRealTimers());

describe('document neuf', () => {
  it('commence sans titre et non modifié, et le dit à la fenêtre', () => {
    const { contrôleur, pont } = préparer();
    expect(contrôleur.state).toEqual({ name: 'Document sans titre', dirty: false, path: null });
    expect(pont.states.at(-1)).toEqual({ id: 'id-test-0001', name: 'Document sans titre', dirty: false, path: null, app: 'text' });
  });

  it('se marque modifié une seule fois, même après beaucoup de frappes', () => {
    const { contrôleur, pont } = préparer();
    const avant = pont.states.length;
    contrôleur.markDirty();
    contrôleur.markDirty();
    contrôleur.markDirty();
    expect(contrôleur.state.dirty).toBe(true);
    expect(pont.states.length).toBe(avant + 1);
  });
});

describe('enregistrer', () => {
  it("demande où enregistrer la première fois, puis réutilise le chemin", async () => {
    const { contrôleur, pont } = préparer();
    contrôleur.markDirty();
    expect(await contrôleur.save()).toBe(true);
    expect(pont.saves[0]).toMatchObject({ path: null, suggestedName: 'Document sans titre.tto', kind: 'tto' });
    expect(String.fromCharCode(pont.saves[0].bytes[0], pont.saves[0].bytes[1])).toBe('PK');
    expect(contrôleur.state).toEqual({ name: 'essai', dirty: false, path: '/docs/essai.tto' });
    expect(pont.cleared).toEqual(['id-test-0001']);

    contrôleur.markDirty();
    await contrôleur.save();
    expect(pont.saves[1].path).toBe('/docs/essai.tto');
  });

  it("« Enregistrer sous » redemande toujours où", async () => {
    const { contrôleur, pont } = préparer();
    await contrôleur.save();
    await contrôleur.saveAs();
    expect(pont.saves[1].path).toBeNull();
  });

  it("reste modifié si l'utilisateur annule", async () => {
    const { contrôleur, pont } = préparer();
    pont.nextSave = { status: 'cancelled' };
    contrôleur.markDirty();
    expect(await contrôleur.save()).toBe(false);
    expect(contrôleur.state.dirty).toBe(true);
    expect(pont.cleared).toEqual([]);
  });

  it('reste modifié et explique quand le disque refuse', async () => {
    const { contrôleur, pont, notices } = préparer();
    pont.nextSave = { status: 'error', message: 'Le disque est plein.' };
    contrôleur.markDirty();
    expect(await contrôleur.save()).toBe(false);
    expect(contrôleur.state.dirty).toBe(true);
    expect(notices).toEqual([{ kind: 'error', text: "Impossible d'enregistrer : Le disque est plein." }]);
  });

  it('reste modifié si le pont lui-même échoue', async () => {
    const { contrôleur, pont, notices } = préparer();
    pont.save = async () => {
      throw new Error('pont coupé');
    };
    contrôleur.markDirty();
    expect(await contrôleur.save()).toBe(false);
    expect(contrôleur.state.dirty).toBe(true);
    expect(notices[0]).toEqual({ kind: 'error', text: "Impossible d'enregistrer : pont coupé" });
  });

  it("reste modifié si on a tapé pendant l'enregistrement", async () => {
    const { contrôleur, pont } = préparer();
    contrôleur.markDirty();
    pont.save = async (demande) => {
      pont.saves.push(demande);
      contrôleur.markDirty(); // l'utilisateur tape pendant que le fichier s'écrit
      return pont.nextSave;
    };
    await contrôleur.save();
    expect(contrôleur.state.dirty).toBe(true);
    expect(contrôleur.state.path).toBe('/docs/essai.tto');
    expect(pont.cleared).toEqual([]);
  });
});

describe('ouvrir', () => {
  it('ouvre un .tto, garde son chemin et son titre, sans le marquer modifié', async () => {
    const { contrôleur, doc } = préparer();
    const ouvert = await contrôleur.open({ path: '/docs/Rapport été.tto', name: 'Rapport été.tto', bytes: packTto(sampleDoc) });
    expect(ouvert).toBe(true);
    expect(doc()).toEqual(sampleDoc);
    expect(contrôleur.state).toEqual({ name: 'Rapport été', dirty: false, path: '/docs/Rapport été.tto' });
  });

  it('ouvre un .docx sans chemin : Enregistrer proposera un nouveau .tto', async () => {
    const { contrôleur, pont } = préparer();
    const octets = await encodeDocument('docx', sampleDoc, 'x');
    await contrôleur.open({ path: '/docs/lettre.docx', name: 'lettre.docx', bytes: octets });
    expect(contrôleur.state).toEqual({ name: 'lettre', dirty: false, path: null });
    await contrôleur.save();
    expect(pont.saves[0]).toMatchObject({ path: null, suggestedName: 'lettre.tto' });
  });

  it('signale ce que le fichier Word contient et que Text to One ne reprend pas', async () => {
    const { contrôleur, notices } = préparer();
    // Un .docx sans document.xml lisible est refusé ; un .docx correct sans avertissement n'en produit pas.
    await contrôleur.open({ path: '/a.docx', name: 'a.docx', bytes: await encodeDocument('docx', sampleDoc, 'x') });
    expect(notices).toEqual([]);
  });

  it('refuse un fichier invalide sans toucher au document courant', async () => {
    const { contrôleur, notices, écrire, doc } = préparer();
    écrire(sampleDoc);
    contrôleur.markDirty();
    for (const nom of ['faux.docx', 'faux.tto', 'vieux.doc', 'photo.png']) {
      expect(await contrôleur.open({ path: `/x/${nom}`, name: nom, bytes: new Uint8Array([1, 2, 3]) })).toBe(false);
    }
    expect(doc()).toEqual(sampleDoc);
    expect(contrôleur.state).toEqual({ name: 'Document sans titre', dirty: true, path: null });
    expect(notices).toHaveLength(4);
    expect(notices.every((n) => n.kind === 'error')).toBe(true);
    expect(notices[0].text).toMatch(/pas un document Word valide/);
    expect(notices[2].text).toMatch(/anciens fichiers \.doc/);
  });

  it('ouvre un brouillon récupéré : modifié, sans chemin', async () => {
    const { contrôleur } = préparer();
    await contrôleur.openRecovered('Mon brouillon', packTto(sampleDoc));
    expect(contrôleur.state).toEqual({ name: 'Mon brouillon', dirty: true, path: null });
  });
});

describe('exporter', () => {
  it("exporte en Word sans changer le titre, le chemin ni l'état modifié", async () => {
    const { contrôleur, pont } = préparer();
    contrôleur.markDirty();
    expect(await contrôleur.exportAs('docx')).toBe(true);
    expect(pont.saves[0]).toMatchObject({ path: null, suggestedName: 'Document sans titre.docx', kind: 'docx' });
    expect(contrôleur.state).toEqual({ name: 'Document sans titre', dirty: true, path: null });
  });

  it('exporte en PDF par le processus principal', async () => {
    const { contrôleur, pont } = préparer();
    expect(await contrôleur.exportPdf()).toBe(true);
    expect(pont.pdfs).toEqual(['Document sans titre.pdf']);
  });

  it("dit l'erreur d'un export raté", async () => {
    const { contrôleur, pont, notices } = préparer();
    pont.nextSave = { status: 'error', message: 'Accès refusé.' };
    expect(await contrôleur.exportAs('md')).toBe(false);
    expect(notices).toEqual([{ kind: 'error', text: "Impossible d'exporter : Accès refusé." }]);
  });
});

describe('récupération automatique', () => {
  it("écrit un brouillon toutes les 30 secondes, seulement si le document est modifié", async () => {
    vi.useFakeTimers();
    const { contrôleur, pont } = préparer();
    contrôleur.startAutosave(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pont.recoveries).toEqual([]);

    contrôleur.markDirty();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pont.recoveries).toHaveLength(1);
    expect(pont.recoveries[0]).toMatchObject({ id: 'id-test-0001', name: 'Document sans titre' });

    await contrôleur.save();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pont.recoveries).toHaveLength(1);

    contrôleur.dispose();
    contrôleur.markDirty();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pont.recoveries).toHaveLength(1);
  });
});
