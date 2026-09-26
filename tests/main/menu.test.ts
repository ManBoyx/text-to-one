import { describe, expect, it, vi } from 'vitest';

// Le faux Menu rend le modèle tel quel : on peut alors le parcourir et « cliquer » sur chaque entrée.
vi.mock('electron', () => ({ Menu: { buildFromTemplate: (modèle: unknown) => modèle } }));

import type { MenuItemConstructorOptions } from 'electron';
import { construireMenu, type MenuDeps } from '../../src/main/menu';
import { MENU_ACTIONS, isMenuAction, type MenuAction } from '../../src/shared/bridge';
import type { AppKind } from '../../src/shared/kinds';

type Modèle = MenuItemConstructorOptions[];

function fabriquer(app: AppKind | null) {
  const actions: MenuAction[] = [];
  const nouveaux: AppKind[] = [];
  const appels = { ouvrir: 0, aPropos: 0, codeSource: 0, miseÀJour: 0, bascule: 0, récent: [] as string[] };
  const deps: MenuDeps = {
    récents: [{ path: '/docs/a.tto', name: 'a.tto' }],
    envoyer: (a) => actions.push(a),
    nouveau: (t) => nouveaux.push(t),
    ouvrir: () => appels.ouvrir++,
    ouvrirRécent: (c) => appels.récent.push(c),
    àPropos: () => appels.aPropos++,
    codeSource: () => appels.codeSource++,
    chercherMiseÀJour: () => appels.miseÀJour++,
    vérificationAuto: true,
    basculerVérificationAuto: () => appels.bascule++,
    développement: false,
    app,
  };
  return { modèle: construireMenu(deps) as unknown as Modèle, actions, nouveaux, appels };
}

/** Toutes les entrées d'un menu, sous-menus compris. */
function entrées(modèle: Modèle): MenuItemConstructorOptions[] {
  return modèle.flatMap((e) => [e, ...(Array.isArray(e.submenu) ? entrées(e.submenu) : [])]);
}
const titres = (modèle: Modèle) => modèle.map((m) => m.label);
const libellés = (modèle: Modèle) => entrées(modèle).map((e) => e.label).filter(Boolean);

/** Clique sur chaque entrée qui a une action et relève ce qu'elle envoie. */
function cliquerTout(app: AppKind | null) {
  const { modèle, actions, nouveaux, appels } = fabriquer(app);
  for (const entrée of entrées(modèle)) (entrée.click as undefined | (() => void))?.();
  return { modèle, actions, nouveaux, appels };
}

describe('menus de chaque application', () => {
  it("n'envoie à la fenêtre que des actions qu'elle connaît", () => {
    for (const app of [null, 'text', 'sheet', 'slides'] as const) {
      const { actions } = cliquerTout(app);
      for (const a of actions) expect(isMenuAction(a), `${app}: ${a}`).toBe(true);
    }
  });

  it('a un menu propre à chaque application', () => {
    expect(titres(fabriquer(null).modèle)).toEqual(['Fichier', 'Affichage', 'Aide']);
    expect(titres(fabriquer('text').modèle)).toEqual(['Fichier', 'Édition', 'Insertion', 'Format', 'Affichage', 'Aide']);
    expect(titres(fabriquer('sheet').modèle)).toEqual(['Fichier', 'Édition', 'Format', 'Insertion', 'Affichage', 'Aide']);
    expect(titres(fabriquer('slides').modèle)).toEqual(['Fichier', 'Édition', 'Insertion', 'Diapositive', 'Format', 'Affichage', 'Aide']);
  });

  it("propose à chaque application ses exports, et seulement les siens", () => {
    const exports = (app: AppKind) => cliquerTout(app).actions.filter((a) => a.startsWith('file:export-')).sort();
    expect(exports('text')).toEqual(['file:export-docx', 'file:export-html', 'file:export-md', 'file:export-pdf', 'file:export-txt']);
    expect(exports('sheet')).toEqual(['file:export-csv', 'file:export-xlsx']);
    expect(exports('slides')).toEqual(['file:export-pdf', 'file:export-pptx']);
    expect(exports('sheet')).not.toContain('file:export-docx');
  });

  it("n'expose les actions d'une application que dans sa fenêtre", () => {
    const préfixes = (app: AppKind | null) => new Set(cliquerTout(app).actions.map((a) => a.split(':')[0]));
    expect(préfixes('sheet').has('slides')).toBe(false);
    expect(préfixes('slides').has('sheet')).toBe(false);
    expect(préfixes('text').has('sheet')).toBe(false);
    expect(préfixes('text').has('slides')).toBe(false);
    expect(préfixes(null).has('format')).toBe(false);
    expect(cliquerTout('sheet').actions).toContain('sheet:insert-row');
    expect(cliquerTout('slides').actions).toContain('slides:present');
    expect(libellés(fabriquer('sheet').modèle)).toContain('Format des nombres');
    expect(libellés(fabriquer('slides').modèle)).toContain('Présenter');
  });

  it('permet de créer les trois types de documents depuis tous les menus', () => {
    for (const app of [null, 'text', 'sheet', 'slides'] as const) {
      expect(cliquerTout(app).nouveaux.sort(), String(app)).toEqual(['sheet', 'slides', 'text']);
    }
  });

  it("l'impression passe par la fenêtre (qui retire d'abord les surlignages de recherche)", () => {
    expect(cliquerTout('text').actions).toContain('file:print');
  });

  it('ouvre les documents récents et les boîtes de dialogue', () => {
    const { appels } = cliquerTout('text');
    expect(appels.ouvrir).toBe(1);
    expect(appels.récent).toEqual(['/docs/a.tto']);
    expect(appels.aPropos).toBe(1);
    expect(appels.codeSource).toBe(1);
  });

  it("n'enregistre pas deux fois les raccourcis que la fenêtre gère elle-même", () => {
    for (const app of ['text', 'sheet', 'slides'] as const) {
      const affichés = entrées(fabriquer(app).modèle).filter((e) => ['CmdOrCtrl+Z', 'CmdOrCtrl+Y', 'CmdOrCtrl+B', 'CmdOrCtrl+I'].includes(String(e.accelerator)));
      expect(affichés.length, app).toBeGreaterThan(0);
      for (const e of affichés) expect(e.registerAccelerator, `${app} ${e.label}`).toBe(false);
    }
    // Dans les présentations, F5, Ctrl+D et Ctrl+M sont gérés par la fenêtre : les enregistrer aussi ouvrirait deux présentations.
    const présentation = entrées(fabriquer('slides').modèle).filter((e) => ['F5', 'CmdOrCtrl+D', 'CmdOrCtrl+M'].includes(String(e.accelerator)));
    expect(présentation.map((e) => e.accelerator).sort()).toEqual(['CmdOrCtrl+D', 'CmdOrCtrl+M', 'F5']);
    for (const e of présentation) expect(e.registerAccelerator, String(e.label)).toBe(false);
  });

  it('a des identifiants uniques dans chaque menu, et toutes les actions déclarées sont utilisées quelque part', () => {
    const utilisées = new Set<string>();
    for (const app of [null, 'text', 'sheet', 'slides'] as const) {
      const ids = entrées(fabriquer(app).modèle).map((e) => e.id).filter(Boolean);
      expect(new Set(ids).size, String(app)).toBe(ids.length);
      for (const a of cliquerTout(app).actions) utilisées.add(a);
    }
    // 'app:save-and-close' est envoyée par la fenêtre elle-même à la fermeture, jamais par un menu.
    // Les actions de vue et de mise en forme du texte sont couvertes par le menu du traitement de texte.
    const inutilisées = MENU_ACTIONS.filter((a) => !utilisées.has(a) && a !== 'app:save-and-close');
    expect(inutilisées).toEqual([]);
  });
});

describe('menu Aide : mises à jour', () => {
  it('propose de chercher une mise à jour et de régler la vérification automatique', () => {
    const { modèle, appels } = fabriquer(null);
    const aide = entrées(modèle).find((e) => e.label === 'Aide')?.submenu as MenuItemConstructorOptions[];
    const chercher = aide.find((e) => e.label === 'Rechercher des mises à jour…');
    const auto = aide.find((e) => e.label === 'Vérifier automatiquement au démarrage');
    expect(auto).toMatchObject({ type: 'checkbox', checked: true });
    (chercher?.click as () => void)();
    (auto?.click as () => void)();
    expect(appels).toMatchObject({ miseÀJour: 1, bascule: 1 });
  });
});
