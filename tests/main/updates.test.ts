import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MessageBoxOptions } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vérifierMisesÀJour, type DépendancesMisesÀJour } from '../../src/main/update-flow';
import { StockageMisesÀJour } from '../../src/main/update-settings';
import { ErreurMiseÀJour, appImageRemplaçable, chercherMiseÀJour, remplacerAppImage } from '../../src/main/updates';
import { PRÉFIXE_TÉLÉCHARGEMENT, analyserVersion, comparerVersions } from '../../src/shared/update';

const NOUVEAU = Buffer.from('nouvelle version de l’application '.repeat(500));
const EMPREINTE = createHash('sha256').update(NOUVEAU).digest('hex');
const URL_FICHIER = `${PRÉFIXE_TÉLÉCHARGEMENT}v1.1.0/Text-to-One-1.1.0.AppImage`;

const version = (extra: Record<string, unknown> = {}) => ({
  tag_name: 'v1.1.0',
  draft: false,
  prerelease: false,
  html_url: 'https://github.com/ManBoyx/text-to-one/releases/tag/v1.1.0',
  body: '## Nouveautés\n- des formules',
  assets: [{ name: 'Text-to-One-1.1.0.AppImage', browser_download_url: URL_FICHIER, size: NOUVEAU.length, digest: `sha256:${EMPREINTE}` }],
  ...extra,
});
const réponseJson = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });

describe('numéros de version', () => {
  it('compare correctement', () => {
    expect(comparerVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(comparerVersions('v2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(comparerVersions('1.0.0', '1.0.0')).toBe(0);
    expect(comparerVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(comparerVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0);
    expect(comparerVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0);
    expect(comparerVersions('abc', '1.0.0')).toBeNaN();
  });

  it('ne propose rien pour une version identique, plus ancienne, illisible, brouillon ou préversion', () => {
    expect(analyserVersion(version(), '1.1.0')).toBeNull();
    expect(analyserVersion(version(), '2.0.0')).toBeNull();
    expect(analyserVersion(version({ tag_name: 'nimporte quoi' }), '1.0.0')).toBeNull();
    expect(analyserVersion(version({ draft: true }), '1.0.0')).toBeNull();
    expect(analyserVersion(version({ prerelease: true }), '1.0.0')).toBeNull();
    expect(analyserVersion(null, '1.0.0')).toBeNull();
    expect(analyserVersion('texte', '1.0.0')).toBeNull();
  });

  it("retient le fichier AppImage et son empreinte, et refuse un fichier d'ailleurs", () => {
    expect(analyserVersion(version(), '1.0.0')).toMatchObject({ version: '1.1.0', appImage: { name: 'Text-to-One-1.1.0.AppImage', sha256: EMPREINTE } });
    const ailleurs = version({ assets: [{ name: 'a.AppImage', browser_download_url: 'https://exemple.fr/a.AppImage', size: 10 }] });
    expect(analyserVersion(ailleurs, '1.0.0')?.appImage).toBeNull();
    const sansEmpreinte = version({ assets: [{ name: 'a.AppImage', browser_download_url: URL_FICHIER, size: 10 }] });
    expect(analyserVersion(sansEmpreinte, '1.0.0')?.appImage?.sha256).toBeNull();
    const énorme = version({ assets: [{ name: 'a.AppImage', browser_download_url: URL_FICHIER, size: 9e9 }] });
    expect(analyserVersion(énorme, '1.0.0')?.appImage).toBeNull();
  });

  it("n'accepte comme page que celle du dépôt", () => {
    expect(analyserVersion(version({ html_url: 'https://pirate.example/x' }), '1.0.0')?.page).toBe('https://github.com/ManBoyx/text-to-one/releases');
  });
});

describe('recherche', () => {
  it('trouve une version plus récente', async () => {
    const chercher = vi.fn(async (_url: string) => réponseJson(version()));
    const trouvée = await chercherMiseÀJour('1.0.0', chercher as never);
    expect(trouvée?.version).toBe('1.1.0');
    expect(String(chercher.mock.calls[0][0])).toBe('https://api.github.com/repos/ManBoyx/text-to-one/releases/latest');
  });

  it("répond « à jour » quand la version est la même ou quand il n'y a encore rien de publié (404)", async () => {
    expect(await chercherMiseÀJour('1.1.0', (async () => réponseJson(version())) as never)).toBeNull();
    expect(await chercherMiseÀJour('1.0.0', (async () => réponseJson({}, 404)) as never)).toBeNull();
  });

  it('les pannes deviennent des erreurs claires', async () => {
    await expect(chercherMiseÀJour('1.0.0', (async () => { throw new Error('réseau'); }) as never)).rejects.toThrow(/connexion/);
    await expect(chercherMiseÀJour('1.0.0', (async () => réponseJson({}, 500)) as never)).rejects.toThrow(/500/);
    await expect(chercherMiseÀJour('1.0.0', (async () => new Response('pas du json')) as never)).rejects.toThrow(/illisible/);
  });
});

describe('remplacement du fichier AppImage', () => {
  let dossier: string;
  let cible: string;
  beforeEach(async () => {
    dossier = await fs.mkdtemp(join(tmpdir(), 'tto-maj-'));
    cible = join(dossier, 'Text-to-One-1.0.0.AppImage');
    await fs.writeFile(cible, 'ancienne version');
  });
  afterEach(() => fs.rm(dossier, { recursive: true, force: true }));

  const fichier = (extra: Partial<{ sha256: string | null; size: number; url: string }> = {}) => ({ name: 'x.AppImage', url: URL_FICHIER, size: NOUVEAU.length, sha256: EMPREINTE, ...extra });
  const serveur = (octets: Buffer | string = NOUVEAU) => (async () => new Response(octets as never)) as never;

  it("remplace l'ancien fichier par le nouveau, exécutable, en signalant l'avancement", async () => {
    const progrès: number[] = [];
    await remplacerAppImage(fichier(), cible, (f) => progrès.push(f), serveur());
    expect(await fs.readFile(cible)).toEqual(NOUVEAU);
    expect((await fs.stat(cible)).mode & 0o111).not.toBe(0);
    expect(progrès.at(-1)).toBe(1);
    expect(await fs.readdir(dossier)).toEqual(['Text-to-One-1.0.0.AppImage']); // pas de reste
  });

  it("un fichier abîmé (mauvaise empreinte) n'est jamais installé et l'ancien reste intact", async () => {
    await expect(remplacerAppImage(fichier(), cible, () => undefined, serveur(Buffer.from('x'.repeat(NOUVEAU.length))))).rejects.toThrow(/abîmé/);
    expect(await fs.readFile(cible, 'utf8')).toBe('ancienne version');
    expect(await fs.readdir(dossier)).toEqual(['Text-to-One-1.0.0.AppImage']);
  });

  it("un téléchargement incomplet, trop long ou en erreur laisse l'ancien fichier", async () => {
    await expect(remplacerAppImage(fichier(), cible, () => undefined, serveur(NOUVEAU.subarray(0, 100)))).rejects.toThrow(/incomplet/);
    await expect(remplacerAppImage(fichier({ size: 50 }), cible, () => undefined, serveur())).rejects.toThrow(/plus gros/);
    await expect(remplacerAppImage(fichier(), cible, () => undefined, (async () => new Response('non', { status: 404 })) as never)).rejects.toThrow(/échoué/);
    expect(await fs.readFile(cible, 'utf8')).toBe('ancienne version');
    expect(await fs.readdir(dossier)).toEqual(['Text-to-One-1.0.0.AppImage']);
  });

  it("refuse sans empreinte fournie et refuse une adresse hors du dépôt, sans même contacter le réseau", async () => {
    const réseau = vi.fn();
    await expect(remplacerAppImage(fichier({ sha256: null }), cible, () => undefined, réseau as never)).rejects.toBeInstanceOf(ErreurMiseÀJour);
    await expect(remplacerAppImage(fichier({ url: 'https://exemple.fr/a' }), cible, () => undefined, réseau as never)).rejects.toBeInstanceOf(ErreurMiseÀJour);
    expect(réseau).not.toHaveBeenCalled();
  });

  it('ne remplace que ce qui est un AppImage existant dans un dossier modifiable', async () => {
    expect(await appImageRemplaçable(cible)).toBe(true);
    expect(await appImageRemplaçable(undefined)).toBe(false);
    expect(await appImageRemplaçable(join(dossier, 'absent.AppImage'))).toBe(false);
    expect(await appImageRemplaçable('/usr/bin/text-to-one')).toBe(false);
  });
});

describe('réglages', () => {
  it("gardent l'ignorée et la date, et se remettent par défaut si le fichier est abîmé", async () => {
    const dossier = await fs.mkdtemp(join(tmpdir(), 'tto-reg-'));
    const chemin = join(dossier, 'maj.json');
    const s = new StockageMisesÀJour(chemin);
    await s.charger();
    expect(s.lire()).toEqual({ auto: true, dernière: 0, ignorée: '' });
    expect(s.àVérifier(1000)).toBe(false); // il y a moins d'un jour... depuis 0
    expect(s.àVérifier(Date.now())).toBe(true);
    await s.modifier({ auto: false, dernière: 5, ignorée: '1.2.0' });
    const relu = new StockageMisesÀJour(chemin);
    await relu.charger();
    expect(relu.lire()).toEqual({ auto: false, dernière: 5, ignorée: '1.2.0' });
    expect(relu.àVérifier(Date.now())).toBe(false); // vérification automatique coupée
    await fs.writeFile(chemin, '{pas du json');
    await relu.charger();
    expect(relu.lire()).toEqual({ auto: true, dernière: 0, ignorée: '' });
    await fs.rm(dossier, { recursive: true });
  });
});

describe('déroulé pour l’utilisateur', () => {
  let dossier: string;
  let appImage: string;
  beforeEach(async () => {
    dossier = await fs.mkdtemp(join(tmpdir(), 'tto-flux-'));
    appImage = join(dossier, 'Text-to-One-1.0.0.AppImage');
    await fs.writeFile(appImage, 'ancienne version');
  });
  afterEach(() => fs.rm(dossier, { recursive: true, force: true }));

  const monter = (réponses: number[], serveur: (url: string) => Response | Promise<Response>) => {
    const boîtes: MessageBoxOptions[] = [];
    const pages: string[] = [];
    const relances: string[] = [];
    const progrès: number[] = [];
    const stockage = new StockageMisesÀJour(join(dossier, 'maj.json'));
    const suite = [...réponses];
    const d: DépendancesMisesÀJour = {
      versionInstallée: '1.0.0',
      titre: 'Text to One',
      stockage,
      appImage,
      afficher: async (o) => (boîtes.push(o), { response: suite.shift() ?? 0 }),
      ouvrirPage: (u) => pages.push(u),
      progression: (f) => progrès.push(f),
      redémarrer: (f) => relances.push(f),
      chercher: (async (url: string) => serveur(url)) as never,
    };
    return { d, boîtes, pages, relances, progrès, stockage };
  };
  const serveurNormal = (url: string) => (url.includes('api.github.com') ? réponseJson(version()) : new Response(NOUVEAU));

  it('mise à jour acceptée : téléchargement, remplacement puis redémarrage', async () => {
    const t = monter([0, 0], serveurNormal); // « Mettre à jour », puis « Redémarrer maintenant »
    await vérifierMisesÀJour(t.d, false);
    expect(t.boîtes[0].message).toContain('1.1.0');
    expect(t.boîtes[0].buttons).toContain('Mettre à jour');
    expect(await fs.readFile(appImage)).toEqual(NOUVEAU);
    expect(t.relances).toEqual([appImage]);
    expect(t.progrès.at(-1)).toBe(-1);
  });

  it("« Plus tard » ne touche à rien ; « Ignorer » n'est plus reproposé au démarrage mais l'est à la demande", async () => {
    const t = monter([2], serveurNormal);
    await vérifierMisesÀJour(t.d, false);
    expect(await fs.readFile(appImage, 'utf8')).toBe('ancienne version');
    expect(t.relances).toEqual([]);

    const u = monter([3, 2], serveurNormal); // « Ignorer », puis « Plus tard » à la demande
    await vérifierMisesÀJour(u.d, false);
    expect(u.stockage.lire().ignorée).toBe('1.1.0');
    await vérifierMisesÀJour(u.d, false);
    expect(u.boîtes).toHaveLength(1); // rien de nouveau au démarrage suivant
    await vérifierMisesÀJour(u.d, true);
    expect(u.boîtes).toHaveLength(2); // mais « Rechercher des mises à jour » la montre
  });

  it('un fichier abîmé affiche une erreur, garde l’ancienne version et propose la page', async () => {
    const t = monter([0, 0], (url) => (url.includes('api.github.com') ? réponseJson(version()) : new Response(Buffer.from('y'.repeat(NOUVEAU.length)))));
    await vérifierMisesÀJour(t.d, false);
    expect(t.boîtes.at(-1)?.type).toBe('error');
    expect(t.pages).toEqual(['https://github.com/ManBoyx/text-to-one/releases/tag/v1.1.0']);
    expect(await fs.readFile(appImage, 'utf8')).toBe('ancienne version');
    expect(t.relances).toEqual([]);
  });

  it("hors AppImage, on propose seulement d'ouvrir la page de téléchargement", async () => {
    const t = monter([0], serveurNormal);
    t.d.appImage = undefined;
    await vérifierMisesÀJour(t.d, true);
    expect(t.boîtes[0].buttons).toEqual(['Télécharger', 'Plus tard', 'Ignorer cette version']);
    expect(t.pages).toHaveLength(1);
    expect(await fs.readFile(appImage, 'utf8')).toBe('ancienne version');
  });

  it('à la demande on répond toujours ; au démarrage, jamais pour « à jour » ni pour une panne', async () => {
    const àJour = (url: string) => (url.includes('api.github.com') ? réponseJson(version({ tag_name: 'v1.0.0' })) : new Response(''));
    const a = monter([], àJour);
    await vérifierMisesÀJour(a.d, false);
    expect(a.boîtes).toHaveLength(0);
    await vérifierMisesÀJour(a.d, true);
    expect(a.boîtes[0].message).toContain('à jour');

    const panne = monter([], () => { throw new Error('hors ligne'); });
    await vérifierMisesÀJour(panne.d, false);
    expect(panne.boîtes).toHaveLength(0);
    await vérifierMisesÀJour(panne.d, true);
    expect(panne.boîtes[0].type).toBe('warning');
  });
});
