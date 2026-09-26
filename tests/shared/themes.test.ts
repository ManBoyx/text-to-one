import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLAIR, PALETTES, SOMBRE, PERSONNALISÉ_PAR_DÉFAUT, THEME_IDS, VARIABLES, avertissements, contraste, estSombre, isHexColor, isThemeId, lirePersonnalisé, lisibleSur, luminance, mixer,
  variablesPersonnalisées,
} from '../../src/shared/themes';

describe('palettes', () => {
  it('ont des identifiants uniques, différents de « clair », « sombre » et « automatique »', () => {
    const ids = PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const réservé of ['system', 'light', 'dark', 'custom']) expect(ids).not.toContain(réservé);
    expect(PALETTES.length).toBeGreaterThanOrEqual(6);
  });

  it('définissent chacune toutes les variables de couleur (sinon la valeur du thème clair resterait visible)', () => {
    for (const palette of PALETTES) {
      expect(Object.keys(palette.variables).sort(), palette.id).toEqual([...VARIABLES].sort());
      for (const [nom, valeur] of Object.entries(palette.variables)) expect(valeur, `${palette.id} ${nom}`).toBeTruthy();
    }
  });

  it('se lisent bien : texte, bouton principal et texte discret ont un contraste suffisant', () => {
    for (const palette of PALETTES) expect(avertissements(palette.variables), palette.id).toEqual([]);
  });

  it("annoncent correctement si elles sont sombres (d'après la luminance de leur surface)", () => {
    for (const palette of PALETTES) expect(luminance(palette.variables['--surface']) < 0.35, palette.id).toBe(palette.dark);
  });

  it('sont toutes reconnues comme identifiants de thème', () => {
    for (const p of PALETTES) expect(isThemeId(p.id)).toBe(true);
    for (const id of ['system', 'light', 'dark', 'custom']) expect(isThemeId(id)).toBe(true);
    expect(THEME_IDS.length).toBe(PALETTES.length + 4);
    for (const faux of ['', 'Océan', 'javascript:', null, 3, undefined]) expect(isThemeId(faux)).toBe(false);
  });
});

describe('couleurs', () => {
  it('reconnaissent les couleurs #rrggbb et refusent le reste (ces valeurs finissent dans des styles)', () => {
    for (const bon of ['#000000', '#FFAA00', '#1d2330']) expect(isHexColor(bon)).toBe(true);
    for (const mauvais of ['#fff', 'red', 'url(x)', '#12345g', '#1234567', '', 3, null]) expect(isHexColor(mauvais)).toBe(false);
  });

  it('calculent des contrastes justes', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contraste('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(contraste('#767676', '#ffffff')).toBeGreaterThan(4.5); // le gris le plus clair qui passe sur blanc
    expect(contraste('#7a7a7a', '#ffffff')).toBeLessThan(4.5);
  });

  it('mélangent deux couleurs et choisissent noir ou blanc selon le fond', () => {
    expect(mixer('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixer('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixer('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(lisibleSur('#ffd400')).toBe('#000000');
    expect(lisibleSur('#1d2330')).toBe('#ffffff');
  });
});

describe('thème personnalisé', () => {
  it('donne un thème complet et lisible avec les couleurs par défaut', () => {
    const v = variablesPersonnalisées(PERSONNALISÉ_PAR_DÉFAUT);
    expect(Object.keys(v).sort()).toEqual([...VARIABLES].sort());
    expect(avertissements(v)).toEqual([]);
    expect(estSombre(PERSONNALISÉ_PAR_DÉFAUT)).toBe(false);
  });

  it("adapte les couleurs d'alerte et l'ombre quand les surfaces sont sombres", () => {
    const sombre = { fond: '#101010', surface: '#1a1a1a', texte: '#f0f0f0', accent: '#ff9f43' };
    expect(estSombre(sombre)).toBe(true);
    const v = variablesPersonnalisées(sombre);
    expect(v['--accent-contrast']).toBe('#000000');
    expect(v['--danger']).toBe('#ff8a80');
    expect(avertissements(v)).toEqual([]);
  });

  it('signale un texte illisible', () => {
    const mauvais = variablesPersonnalisées({ fond: '#ffffff', surface: '#ffffff', texte: '#dddddd', accent: '#2456d6' });
    expect(avertissements(mauvais)).toContain('texte');
  });

  it("relit un thème enregistré et remplace toute valeur douteuse par celle par défaut", () => {
    expect(lirePersonnalisé({ fond: '#AABBCC', surface: 'url(x)', texte: 3, accent: '#123456' })).toEqual({
      fond: '#aabbcc', surface: PERSONNALISÉ_PAR_DÉFAUT.surface, texte: PERSONNALISÉ_PAR_DÉFAUT.texte, accent: '#123456',
    });
    expect(lirePersonnalisé(null)).toEqual(PERSONNALISÉ_PAR_DÉFAUT);
    expect(lirePersonnalisé('n\'importe quoi')).toEqual(PERSONNALISÉ_PAR_DÉFAUT);
  });
});

describe('« Clair » et « Sombre »', () => {
  const css = readFileSync('src/renderer/styles/base.css', 'utf-8');
  /** Les variables déclarées dans le premier bloc qui suit ce sélecteur. */
  const bloc = (sélecteur: string): Record<string, string> => {
    const début = css.indexOf(sélecteur);
    const fin = css.indexOf('}', début);
    const valeurs: Record<string, string> = {};
    for (const [, nom, valeur] of css.slice(début, fin).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) valeurs[nom] = valeur.trim();
    return valeurs;
  };

  it('ont les mêmes couleurs dans base.css et dans les vignettes du sélecteur de thèmes', () => {
    for (const [nom, valeur] of Object.entries(bloc(':root {'))) if (nom in CLAIR) expect(CLAIR[nom as keyof typeof CLAIR], nom).toBe(valeur);
    for (const [nom, valeur] of Object.entries(bloc(":root[data-theme='dark'] {"))) if (nom in SOMBRE) expect(SOMBRE[nom as keyof typeof SOMBRE], nom).toBe(valeur);
  });

  it('se lisent bien', () => {
    expect(avertissements(CLAIR)).toEqual([]);
    expect(avertissements(SOMBRE)).toEqual([]);
  });
});
