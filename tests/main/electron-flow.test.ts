import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => ({
  canaux: new Map<string, (...args: any[]) => any>(),
  écouteurs: new Map<string, (...args: any[]) => any>(),
  dialog: { showMessageBox: vi.fn(), showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  liens: [] as string[],
  documents: '',
}));

vi.mock('electron', () => {
  class FauxContenu {
    envoyés: unknown[][] = [];
    mainFrame = { url: 'file:///app/dist/renderer/index.html' };
    session = { setSpellCheckerLanguages: () => undefined, addWordToSpellCheckerDictionary: () => undefined };
    send(...args: unknown[]) {
      this.envoyés.push(args);
    }
    on() {}
    setWindowOpenHandler() {}
    getURL() {
      return this.mainFrame.url;
    }
    replaceMisspelling() {}
    printToPDF = async () => new Uint8Array([37, 80, 68, 70, 45]);
  }
  class FauxFenêtre {
    static toutes: FauxFenêtre[] = [];
    static compteur = 1;
    static fromWebContents(contenu: unknown) {
      return FauxFenêtre.toutes.find((f) => f.webContents === contenu) ?? null;
    }
    static getFocusedWindow() {
      return FauxFenêtre.toutes[0] ?? null;
    }
    static getAllWindows() {
      return FauxFenêtre.toutes;
    }
    id = FauxFenêtre.compteur++;
    webContents = new FauxContenu();
    gestionnaires = new Map<string, (...args: any[]) => void>();
    titre = '';
    constructor(_options: unknown) {
      FauxFenêtre.toutes.push(this);
    }
    once(nom: string, fn: (...args: any[]) => void) {
      this.gestionnaires.set(`once:${nom}`, fn);
    }
    on(nom: string, fn: (...args: any[]) => void) {
      this.gestionnaires.set(nom, fn);
    }
    show() {}
    menus: unknown[] = [];
    setMenu(menu: unknown) {
      this.menus.push(menu);
    }
    setTitle(titre: string) {
      this.titre = titre;
    }
    loadFile() {
      return Promise.resolve();
    }
    /** Comme Electron : l'événement « close » peut être empêché ; sinon la fenêtre disparaît. */
    close() {
      const événement = { empêché: false, preventDefault() { this.empêché = true; } };
      this.gestionnaires.get('close')?.(événement);
      if (!événement.empêché) {
        FauxFenêtre.toutes = FauxFenêtre.toutes.filter((f) => f !== this);
        this.gestionnaires.get('closed')?.();
      }
    }
  }
  return {
    app: { getPath: () => h.documents },
    ipcMain: {
      handle: (canal: string, fn: (...args: any[]) => any) => h.canaux.set(canal, fn),
      on: (canal: string, fn: (...args: any[]) => any) => h.écouteurs.set(canal, fn),
    },
    dialog: h.dialog,
    shell: { openExternal: (url: string) => h.liens.push(url) },
    BrowserWindow: FauxFenêtre,
    Menu: { buildFromTemplate: () => ({ popup() {} }) },
  };
});

import { BrowserWindow } from 'electron';
import { enregistrerIpc, type ContexteIpc } from '../../src/main/ipc';
import { RecentsStore } from '../../src/main/recents';
import { RecoveryStore } from '../../src/main/recovery';
import { créerFenêtre, définirFournisseurDeMenu, initialiserFenêtres, ouvrirDemande } from '../../src/main/windows';

const Faux = BrowserWindow as unknown as {
  toutes: any[];
  compteur: number;
};

let dossier: string;
let contexte: ContexteIpc;
let recents: RecentsStore;
let recovery: RecoveryStore;

/** Un message venu de la page principale : dans Electron, `senderFrame` est alors le même objet que `mainFrame`. */
const événement = (fenêtre: any) => ({ sender: fenêtre.webContents, senderFrame: fenêtre.webContents.mainFrame });
const appeler = (canal: string, fenêtre: any, ...args: unknown[]) => (h.canaux.get(canal) ?? h.écouteurs.get(canal))!(événement(fenêtre), ...args);
const nouvelleFenêtre = (demande = null as any) => créerFenêtre(demande) as any;
const attendre = () => new Promise((résoudre) => setTimeout(résoudre, 0));

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'tto-flow-'));
  h.documents = dossier;
  h.canaux.clear();
  h.écouteurs.clear();
  h.liens.length = 0;
  Faux.toutes = [];
  h.dialog.showMessageBox.mockReset();
  h.dialog.showSaveDialog.mockReset();
  h.dialog.showOpenDialog.mockReset();
  recents = new RecentsStore({ read: async () => null, write: async () => undefined });
  recovery = new RecoveryStore(join(dossier, 'brouillons'));
  contexte = { recents, recovery, reconstruireMenu: vi.fn() };
  initialiserFenêtres(recovery);
  enregistrerIpc(contexte);
});
afterEach(() => rmSync(dossier, { recursive: true, force: true }));

const demandeDeSauvegarde = (extra: object = {}) => ({ path: null, suggestedName: 'Rapport été.tto', kind: 'tto', bytes: new Uint8Array([80, 75, 1, 2]), ...extra });
const ID = 'abcdef12-3456-7890-abcd-ef1234567890';

describe('sécurité des échanges', () => {
  it("ne répond qu'à la page principale de l'application", async () => {
    const f = nouvelleFenêtre();
    // Une page à l'intérieur de la page (iframe), même adresse locale : refusée.
    const sousCadre = { sender: f.webContents, senderFrame: { url: f.webContents.mainFrame.url } };
    await expect(async () => h.canaux.get('tto:list-recents')!(sousCadre)).rejects.toThrow('Expéditeur non autorisé');
    // La fenêtre a été détournée vers un site web : refusée aussi, pour toutes les demandes.
    f.webContents.mainFrame.url = 'https://exemple.fr/page';
    await expect(async () => h.canaux.get('tto:list-recents')!(événement(f))).rejects.toThrow('Expéditeur non autorisé');
    await expect(async () => h.canaux.get('tto:save')!(événement(f), demandeDeSauvegarde())).rejects.toThrow('Expéditeur non autorisé');
    expect(h.dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it('donne à la fenêtre ce qu\'elle doit afficher, une seule fois', async () => {
    const f = nouvelleFenêtre({ type: 'new' });
    expect(await appeler('tto:init', f)).toEqual({ type: 'new' });
    expect(await appeler('tto:init', f)).toBeNull();
  });

  it("n'ouvre au dehors que les liens web et les adresses de courriel", () => {
    const f = nouvelleFenêtre();
    for (const url of ['https://exemple.fr', 'http://exemple.fr', 'mailto:a@exemple.fr', 'file:///etc/passwd', 'javascript:alert(1)', 'ftp://x']) appeler('tto:open-external', f, url);
    expect(h.liens).toEqual(['https://exemple.fr', 'http://exemple.fr', 'mailto:a@exemple.fr']);
  });
});

describe('enregistrement sur le disque', () => {
  it("demande où enregistrer, ajoute l'extension, écrit le vrai fichier et retient le document", async () => {
    const f = nouvelleFenêtre();
    h.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(dossier, 'Rapport été') });
    const résultat = await appeler('tto:save', f, demandeDeSauvegarde());
    const chemin = join(dossier, 'Rapport été.tto');
    expect(résultat).toEqual({ status: 'saved', path: chemin, name: 'Rapport été.tto' });
    expect([...readFileSync(chemin)]).toEqual([80, 75, 1, 2]);
    expect(recents.has(chemin)).toBe(true);
    expect(contexte.reconstruireMenu).toHaveBeenCalled();
    expect(h.dialog.showSaveDialog.mock.calls[0][1].defaultPath).toBe(join(dossier, 'Rapport été.tto'));
  });

  it("réécrit directement un document qu'elle a elle-même enregistré, sans reposer la question", async () => {
    const f = nouvelleFenêtre();
    h.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(dossier, 'a.tto') });
    const premier = await appeler('tto:save', f, demandeDeSauvegarde());
    const chemin = (premier as any).path;
    await appeler('tto:save', f, demandeDeSauvegarde({ path: chemin, bytes: new Uint8Array([9, 9]) }));
    expect(h.dialog.showSaveDialog).toHaveBeenCalledTimes(1);
    expect([...readFileSync(chemin)]).toEqual([9, 9]);
  });

  it("refuse d'écrire ailleurs que dans un document que la fenêtre a ouvert ou enregistré", async () => {
    const f = nouvelleFenêtre();
    const intrus = join(dossier, 'important.txt');
    writeFileSync(intrus, 'ne pas toucher');
    h.dialog.showSaveDialog.mockResolvedValue({ canceled: true });
    const résultat = await appeler('tto:save', f, demandeDeSauvegarde({ path: intrus }));
    expect(résultat).toEqual({ status: 'cancelled' }); // le chemin réclamé est ignoré : on demande à l'utilisateur
    expect(h.dialog.showSaveDialog).toHaveBeenCalledTimes(1);
    expect(readFileSync(intrus, 'utf8')).toBe('ne pas toucher');
  });

  it('ne crée rien quand on annule', async () => {
    const f = nouvelleFenêtre();
    h.dialog.showSaveDialog.mockResolvedValue({ canceled: true });
    expect(await appeler('tto:save', f, demandeDeSauvegarde())).toEqual({ status: 'cancelled' });
    expect(existsSync(join(dossier, 'Rapport été.tto'))).toBe(false);
    expect(recents.entries()).toEqual([]);
  });

  it('explique quand le dossier choisi n\'existe pas, sans rien créer', async () => {
    const f = nouvelleFenêtre();
    h.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(dossier, 'absent', 'a.tto') });
    const résultat: any = await appeler('tto:save', f, demandeDeSauvegarde());
    expect(résultat.status).toBe('error');
    expect(résultat.message).toMatch(/introuvable/);
    expect(existsSync(join(dossier, 'absent'))).toBe(false);
  });

  it('range les exports à part : ni documents récents, ni droit de réécriture', async () => {
    const f = nouvelleFenêtre();
    h.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(dossier, 'sortie.docx') });
    const résultat: any = await appeler('tto:save', f, demandeDeSauvegarde({ kind: 'docx', suggestedName: 'sortie.docx' }));
    expect(résultat.status).toBe('saved');
    expect(recents.entries()).toEqual([]);
    await appeler('tto:save', f, demandeDeSauvegarde({ kind: 'docx', path: résultat.path }));
    expect(h.dialog.showSaveDialog).toHaveBeenCalledTimes(2); // le chemin n'est pas devenu « autorisé »
  });

  it('refuse les demandes mal formées', async () => {
    const f = nouvelleFenêtre();
    for (const mauvaise of [null, 'texte', 42, demandeDeSauvegarde({ kind: 'exe' }), demandeDeSauvegarde({ bytes: 'pas des octets' }), demandeDeSauvegarde({ suggestedName: 'x'.repeat(400) }), demandeDeSauvegarde({ path: 5 })]) {
      const résultat: any = await appeler('tto:save', f, mauvaise);
      expect(résultat.status, JSON.stringify(mauvaise)).toBe('error');
    }
    expect(h.dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it('exporte un vrai PDF', async () => {
    const f = nouvelleFenêtre();
    h.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(dossier, 'sortie') });
    const résultat: any = await appeler('tto:export-pdf', f, 'Mon rapport.pdf');
    expect(résultat).toEqual({ status: 'saved', path: join(dossier, 'sortie.pdf'), name: 'sortie.pdf' });
    expect(readFileSync(résultat.path).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('documents récents', () => {
  it("n'ouvre que ce qui figure dans les récents", async () => {
    const f = nouvelleFenêtre();
    const secret = join(dossier, 'secret.tto');
    writeFileSync(secret, 'x');
    const résultat: any = await appeler('tto:read-recent', f, secret);
    expect(résultat.status).toBe('error');
    expect(résultat.message).toMatch(/ne fait plus partie/);
    expect(await appeler('tto:read-recent', f, 42)).toMatchObject({ status: 'error' });
  });

  it('ouvre un récent, et l\'oublie quand le fichier a disparu', async () => {
    const f = nouvelleFenêtre();
    const chemin = join(dossier, 'Léa – été.tto');
    writeFileSync(chemin, Buffer.from([1, 2, 3]));
    await recents.add(chemin, 'Léa – été.tto');
    const ouvert: any = await appeler('tto:read-recent', f, chemin);
    expect(ouvert.status).toBe('opened');
    expect(ouvert.file.name).toBe('Léa – été.tto');
    expect([...ouvert.file.bytes]).toEqual([1, 2, 3]);

    rmSync(chemin);
    const perdu: any = await appeler('tto:read-recent', f, chemin);
    expect(perdu.status).toBe('error');
    expect(recents.has(chemin)).toBe(false);
  });

  it("ouvre un document choisi dans la boîte « Ouvrir » et l'autorise à être réécrit", async () => {
    const f = nouvelleFenêtre();
    const chemin = join(dossier, 'a.tto');
    writeFileSync(chemin, Buffer.from([7]));
    h.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [chemin] });
    const ouvert: any = await appeler('tto:open-dialog', f);
    expect(ouvert.status).toBe('opened');
    await appeler('tto:save', f, demandeDeSauvegarde({ path: chemin, bytes: new Uint8Array([8]) }));
    expect(h.dialog.showSaveDialog).not.toHaveBeenCalled();
    expect([...readFileSync(chemin)]).toEqual([8]);
  });
});

describe('titre de la fenêtre', () => {
  it("montre le nom, un point quand le document est modifié, et ignore les états invalides", () => {
    const f = nouvelleFenêtre();
    appeler('tto:window-state', f, { id: ID, name: 'Rapport', dirty: true, path: null });
    expect(f.titre).toBe('• Rapport — Text to One');
    appeler('tto:window-state', f, { id: ID, name: 'Rapport', dirty: false, path: '/a.tto' });
    expect(f.titre).toBe('Rapport — Text to One');
    appeler('tto:window-state', f, { id: 5, name: [], dirty: 'oui' });
    expect(f.titre).toBe('Rapport — Text to One');
    appeler('tto:window-state', f, { id: 'accueil', name: 'Text to One', dirty: false, path: null });
    expect(f.titre).toBe('Text to One');
  });
});

describe('fermeture d\'une fenêtre', () => {
  const modifier = (f: any) => appeler('tto:window-state', f, { id: ID, name: 'Rapport', dirty: true, path: null });

  it('se ferme sans rien demander quand le document n\'est pas modifié', async () => {
    const f = nouvelleFenêtre();
    appeler('tto:window-state', f, { id: ID, name: 'Rapport', dirty: false, path: '/a.tto' });
    f.close();
    await attendre();
    expect(h.dialog.showMessageBox).not.toHaveBeenCalled();
    expect(Faux.toutes).toHaveLength(0);
  });

  it('demande quoi faire, dans les termes prévus', async () => {
    const f = nouvelleFenêtre();
    modifier(f);
    h.dialog.showMessageBox.mockResolvedValue({ response: 2 });
    f.close();
    await attendre();
    const options = h.dialog.showMessageBox.mock.calls[0][1];
    expect(options.buttons).toEqual(['Enregistrer', 'Ne pas enregistrer', 'Annuler']);
    expect(options.message).toContain('Rapport');
    expect(options.cancelId).toBe(2);
  });

  it('garde la fenêtre quand on annule', async () => {
    const f = nouvelleFenêtre();
    modifier(f);
    h.dialog.showMessageBox.mockResolvedValue({ response: 2 });
    f.close();
    await attendre();
    expect(Faux.toutes).toEqual([f]);
    expect(f.webContents.envoyés.filter((m: unknown[]) => m[0] === 'tto:menu')).toEqual([]);
  });

  it('ferme et supprime le brouillon quand on choisit « Ne pas enregistrer »', async () => {
    const f = nouvelleFenêtre();
    modifier(f);
    await recovery.write(ID, 'Rapport', new Uint8Array([1]));
    h.dialog.showMessageBox.mockResolvedValue({ response: 1 });
    f.close();
    await vi.waitFor(() => expect(Faux.toutes).toHaveLength(0));
    await vi.waitFor(async () => expect(await recovery.list()).toEqual([])); // la suppression du brouillon est asynchrone
  });

  it("demande à la fenêtre d'enregistrer quand on choisit « Enregistrer », et ne ferme qu'ensuite", async () => {
    const f = nouvelleFenêtre();
    modifier(f);
    await recovery.write(ID, 'Rapport', new Uint8Array([1]));
    h.dialog.showMessageBox.mockResolvedValue({ response: 0 });
    f.close();
    await attendre();
    expect(f.webContents.envoyés).toContainEqual(['tto:menu', 'app:save-and-close']);
    expect(Faux.toutes).toEqual([f]); // pas encore fermée : l'enregistrement peut être annulé
    appeler('tto:close-window', f); // la fenêtre a enregistré et demande à se fermer
    await vi.waitFor(() => expect(Faux.toutes).toHaveLength(0));
    await vi.waitFor(async () => expect(await recovery.list()).toEqual([]));
  });
});

describe('ouverture dans une fenêtre existante ou nouvelle', () => {
  const fichier = { type: 'file', file: { path: join('x', 'a.tto'), name: 'a.tto', bytes: new Uint8Array([1]) } } as any;

  it("réutilise une fenêtre vierge (accueil ou document neuf non touché)", () => {
    const accueil = nouvelleFenêtre();
    appeler('tto:window-state', accueil, { id: 'accueil', name: 'Text to One', dirty: false, path: null });
    ouvrirDemande(fichier, accueil);
    expect(Faux.toutes).toHaveLength(1);
    expect(accueil.webContents.envoyés).toContainEqual(['tto:open-request', fichier]);

    const neuf = nouvelleFenêtre();
    appeler('tto:window-state', neuf, { id: ID, name: 'Document sans titre', dirty: false, path: null });
    ouvrirDemande(fichier, neuf);
    expect(Faux.toutes).toHaveLength(2);
    expect(neuf.webContents.envoyés).toContainEqual(['tto:open-request', fichier]);
  });

  it('ouvre une nouvelle fenêtre quand la courante contient du travail', () => {
    for (const état of [
      { id: ID, name: 'Document sans titre', dirty: true, path: null },
      { id: ID, name: 'Rapport', dirty: false, path: '/a.tto' },
      { id: ID, name: 'lettre', dirty: false, path: null },
    ]) {
      Faux.toutes = [];
      const f = nouvelleFenêtre();
      appeler('tto:window-state', f, état);
      ouvrirDemande(fichier, f);
      expect(Faux.toutes, JSON.stringify(état)).toHaveLength(2);
      expect(f.webContents.envoyés.filter((m: unknown[]) => m[0] === 'tto:open-request')).toEqual([]);
    }
  });
});

describe('plusieurs applications dans la même suite', () => {
  it('donne à chaque fenêtre les menus de son application', () => {
    const fournisseur = vi.fn((app: string | null) => ({ app }));
    définirFournisseurDeMenu(fournisseur as any);
    const f = nouvelleFenêtre();
    expect(f.menus).toEqual([{ app: null }]); // l'accueil
    appeler('tto:window-state', f, { id: ID, name: 'Budget', dirty: false, path: null, app: 'sheet' });
    expect(f.menus.at(-1)).toEqual({ app: 'sheet' });
    appeler('tto:window-state', f, { id: ID, name: 'Budget', dirty: true, path: null, app: 'sheet' });
    expect(f.menus).toHaveLength(2); // pas de reconstruction tant que l'application ne change pas
    appeler('tto:window-state', f, { id: 'abcdef12-0000-0000-0000-000000000000', name: 'Expo', dirty: false, path: null, app: 'slides' });
    expect(f.menus.at(-1)).toEqual({ app: 'slides' });
    appeler('tto:window-state', f, { id: ID, name: 'x', dirty: false, path: null, app: 'nimporte-quoi' });
    expect(f.menus.at(-1)).toEqual({ app: null });
    définirFournisseurDeMenu(null as any);
  });

  it('range le brouillon d\'un tableur sous son propre format, et le retrouve', async () => {
    const f = nouvelleFenêtre();
    await appeler('tto:write-recovery', f, ID, 'Budget', new Uint8Array([1, 2]), 'sheet');
    await appeler('tto:write-recovery', f, 'abcdef12-1111-2222-3333-444444444444', 'Expo', new Uint8Array([3]), 'slides');
    await appeler('tto:write-recovery', f, 'abcdef12-5555-6666-7777-888888888888', 'Lettre', new Uint8Array([4]), 'text');
    const liste = (await recovery.list()).map((b) => [b.name, b.ext]).sort();
    expect(liste).toEqual([['Budget', 'tts'], ['Expo', 'ttp'], ['Lettre', 'tto']]);
    await expect(appeler('tto:write-recovery', f, ID, 'x', new Uint8Array([1]), 'pdf')).resolves.toBeUndefined(); // application inconnue : traitée comme du texte
  });

  it("autorise la réécriture des trois formats propres, mais pas des formats d'export", async () => {
    const f = nouvelleFenêtre();
    for (const [kind, ext] of [['tts', 'tts'], ['ttp', 'ttp']] as const) {
      const cible = join(dossier, `doc.${ext}`);
      h.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: cible });
      const premier: any = await appeler('tto:save', f, demandeDeSauvegarde({ kind, suggestedName: `doc.${ext}` }));
      expect(premier.status).toBe('saved');
      const avant = h.dialog.showSaveDialog.mock.calls.length;
      await appeler('tto:save', f, demandeDeSauvegarde({ kind, path: cible, bytes: new Uint8Array([9]) }));
      expect(h.dialog.showSaveDialog.mock.calls.length).toBe(avant); // réécrit sans reposer la question
      expect(recents.has(cible)).toBe(true);
    }
    h.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(dossier, 'classeur.xlsx') });
    const export_: any = await appeler('tto:save', f, demandeDeSauvegarde({ kind: 'xlsx', suggestedName: 'classeur.xlsx' }));
    expect(recents.has(export_.path)).toBe(false);
  });

  it('ouvre les trois types de documents dans une fenêtre vierge', () => {
    for (const nom of ['a.tto', 'b.tts', 'c.ttp']) {
      Faux.toutes = [];
      const f = nouvelleFenêtre();
      appeler('tto:window-state', f, { id: 'accueil', name: 'Text to One', dirty: false, path: null, app: null });
      const demande = { type: 'file', file: { path: join('x', nom), name: nom, bytes: new Uint8Array([1]) } } as any;
      ouvrirDemande(demande, f);
      expect(Faux.toutes, nom).toHaveLength(1);
      expect(f.webContents.envoyés).toContainEqual(['tto:open-request', demande]);
    }
  });
});
