/**
 * Les thèmes de couleurs : la liste des palettes proposées, et le calcul d'un thème personnalisé à partir de quatre couleurs.
 * Tout est ici en données pures, pour pouvoir vérifier les contrastes par des tests.
 */

/** Les variables CSS que chaque thème doit définir (celles de styles/base.css). */
export const VARIABLES = [
  '--bg', '--surface', '--surface-2', '--text', '--muted', '--border', '--accent', '--accent-contrast', '--accent-soft', '--danger', '--warning', '--shadow',
] as const;
export type Variable = (typeof VARIABLES)[number];
export type Variables = Record<Variable, string>;

export interface Palette {
  id: string;
  label: string;
  /** Vrai si les surfaces sont sombres (règle les cases à cocher et barres de défilement du système). */
  dark: boolean;
  variables: Variables;
}

const ombre = (opacité: number, flou: number) => `0 1px 2px rgba(0, 0, 0, ${opacité}), 0 8px 24px rgba(0, 0, 0, ${flou})`;

/** Les palettes en plus de « Clair » et « Sombre », qui restent définies dans styles/base.css. */
export const PALETTES: readonly Palette[] = [
  {
    id: 'ocean', label: 'Océan', dark: true,
    variables: { '--bg': '#0b1a2b', '--surface': '#10263d', '--surface-2': '#16324f', '--text': '#e4f0ff', '--muted': '#93b3d2', '--border': '#26496b', '--accent': '#38bdf8', '--accent-contrast': '#04202f', '--accent-soft': '#173a57', '--danger': '#ff8a80', '--warning': '#f5b041', '--shadow': ombre(0.45, 0.5) },
  },
  {
    id: 'foret', label: 'Forêt', dark: true,
    variables: { '--bg': '#0f1a14', '--surface': '#15241b', '--surface-2': '#1c3024', '--text': '#e6f2ea', '--muted': '#98b9a5', '--border': '#2d4a39', '--accent': '#4ade80', '--accent-contrast': '#04210f', '--accent-soft': '#1d3d2a', '--danger': '#ff8a80', '--warning': '#f5b041', '--shadow': ombre(0.45, 0.5) },
  },
  {
    id: 'crepuscule', label: 'Crépuscule', dark: true,
    variables: { '--bg': '#16121f', '--surface': '#1e1830', '--surface-2': '#271f3f', '--text': '#ece6fa', '--muted': '#ab9fcb', '--border': '#3b3060', '--accent': '#a78bfa', '--accent-contrast': '#15092e', '--accent-soft': '#332a55', '--danger': '#ff8a9b', '--warning': '#f5b041', '--shadow': ombre(0.5, 0.55) },
  },
  {
    id: 'sepia', label: 'Sépia', dark: false,
    variables: { '--bg': '#efe6d6', '--surface': '#faf4e8', '--surface-2': '#f3ead8', '--text': '#3b3024', '--muted': '#6f5f4a', '--border': '#d8c9ae', '--accent': '#9a4a14', '--accent-contrast': '#ffffff', '--accent-soft': '#f0dcc4', '--danger': '#a8281a', '--warning': '#8a5a00', '--shadow': '0 1px 2px rgba(60, 40, 20, 0.1), 0 8px 24px rgba(60, 40, 20, 0.12)' },
  },
  {
    id: 'menthe', label: 'Menthe', dark: false,
    variables: { '--bg': '#e4f1ec', '--surface': '#f7fcfa', '--surface-2': '#ecf7f2', '--text': '#163126', '--muted': '#4a6f60', '--border': '#c2ddd1', '--accent': '#0b7a5e', '--accent-contrast': '#ffffff', '--accent-soft': '#d2eee3', '--danger': '#b42318', '--warning': '#8a5a00', '--shadow': '0 1px 2px rgba(20, 50, 40, 0.08), 0 8px 24px rgba(20, 50, 40, 0.1)' },
  },
  {
    id: 'rose', label: 'Rose', dark: false,
    variables: { '--bg': '#f6e9ee', '--surface': '#fff8fb', '--surface-2': '#fbeff4', '--text': '#3a1a28', '--muted': '#7d4d63', '--border': '#ebcfdb', '--accent': '#c2255c', '--accent-contrast': '#ffffff', '--accent-soft': '#fbdbe8', '--danger': '#b42318', '--warning': '#8a5a00', '--shadow': '0 1px 2px rgba(60, 20, 40, 0.08), 0 8px 24px rgba(60, 20, 40, 0.1)' },
  },
  {
    id: 'contraste', label: 'Contraste élevé', dark: true,
    variables: { '--bg': '#000000', '--surface': '#000000', '--surface-2': '#1a1a1a', '--text': '#ffffff', '--muted': '#e0e0e0', '--border': '#ffffff', '--accent': '#ffd400', '--accent-contrast': '#000000', '--accent-soft': '#3a3200', '--danger': '#ff6b6b', '--warning': '#ffb020', '--shadow': 'none' },
  },
];

/** « Clair » et « Sombre » : les mêmes valeurs que styles/base.css (un test le vérifie), utiles pour les aperçus. */
export const CLAIR: Variables = {
  '--bg': '#eceff3', '--surface': '#ffffff', '--surface-2': '#f4f6f9', '--text': '#1d2330', '--muted': '#5b6678', '--border': '#d3d8e0', '--accent': '#2456d6',
  '--accent-contrast': '#ffffff', '--accent-soft': '#e3ebff', '--danger': '#b42318', '--warning': '#b86e00', '--shadow': '0 1px 2px rgba(20, 30, 50, 0.08), 0 8px 24px rgba(20, 30, 50, 0.1)',
};
export const SOMBRE: Variables = {
  '--bg': '#12151b', '--surface': '#1b1f27', '--surface-2': '#232833', '--text': '#e6e9ef', '--muted': '#9aa5b6', '--border': '#333a47', '--accent': '#6f97ff',
  '--accent-contrast': '#0b1020', '--accent-soft': '#24304f', '--danger': '#ff7b72', '--warning': '#f0a53a', '--shadow': '0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.45)',
};

export const THEME_IDS = ['system', 'light', 'dark', ...PALETTES.map((p) => p.id), 'custom'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const isThemeId = (valeur: unknown): valeur is ThemeId => typeof valeur === 'string' && (THEME_IDS as readonly string[]).includes(valeur);

// ---------- couleurs

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (valeur: unknown): valeur is string => typeof valeur === 'string' && HEX.test(valeur);

export type Rgb = [number, number, number];
export const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
export const toHex = ([r, g, b]: Rgb): string => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** Mélange `a` et `b` : part = 0 donne `a`, part = 1 donne `b`. */
export function mixer(a: string, b: string, part: number): string {
  const [ra, rb] = [toRgb(a), toRgb(b)];
  return toHex(ra.map((v, i) => v + (rb[i] - v) * part) as Rgb);
}

/** Luminance relative selon WCAG 2 (0 = noir, 1 = blanc). */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs (de 1 à 21) : 4,5 est le minimum pour du texte courant. */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Noir ou blanc, selon ce qui se lit le mieux sur cette couleur. */
export const lisibleSur = (fond: string): string => (contraste(fond, '#000000') >= contraste(fond, '#ffffff') ? '#000000' : '#ffffff');

// ---------- thème personnalisé

export interface Personnalisé {
  fond: string;
  surface: string;
  texte: string;
  accent: string;
}

export const PERSONNALISÉ_PAR_DÉFAUT: Personnalisé = { fond: '#eceff3', surface: '#ffffff', texte: '#1d2330', accent: '#2456d6' };

/** Relit un thème personnalisé enregistré : toute valeur douteuse est remplacée par celle par défaut. */
export function lirePersonnalisé(brut: unknown): Personnalisé {
  const source = typeof brut === 'object' && brut !== null ? (brut as Record<string, unknown>) : {};
  const choisir = (clé: keyof Personnalisé): string => (isHexColor(source[clé]) ? (source[clé] as string).toLowerCase() : PERSONNALISÉ_PAR_DÉFAUT[clé]);
  return { fond: choisir('fond'), surface: choisir('surface'), texte: choisir('texte'), accent: choisir('accent') };
}

export function estSombre(p: Personnalisé): boolean {
  return luminance(p.surface) < 0.35;
}

/** Toutes les variables du thème à partir des quatre couleurs choisies. */
export function variablesPersonnalisées(p: Personnalisé): Variables {
  const sombre = estSombre(p);
  return {
    '--bg': p.fond,
    '--surface': p.surface,
    '--surface-2': mixer(p.surface, p.texte, 0.06),
    '--text': p.texte,
    '--muted': mixer(p.texte, p.surface, 0.36),
    '--border': mixer(p.surface, p.texte, 0.2),
    '--accent': p.accent,
    '--accent-contrast': lisibleSur(p.accent),
    '--accent-soft': mixer(p.surface, p.accent, 0.2),
    '--danger': sombre ? '#ff8a80' : '#b42318',
    '--warning': sombre ? '#f5b041' : '#8a5a00',
    '--shadow': sombre ? ombre(0.45, 0.5) : '0 1px 2px rgba(20, 30, 50, 0.08), 0 8px 24px rgba(20, 30, 50, 0.1)',
  };
}

/** Les points faibles d'un thème : texte trop pâle sur la surface, bouton illisible. Vide si tout va bien. */
export function avertissements(v: Variables): ('texte' | 'accent' | 'discret')[] {
  const problèmes: ('texte' | 'accent' | 'discret')[] = [];
  if (contraste(v['--text'], v['--surface']) < 4.5 || contraste(v['--text'], v['--bg']) < 4.5) problèmes.push('texte');
  if (contraste(v['--accent-contrast'], v['--accent']) < 4.5 || contraste(v['--accent'], v['--surface']) < 3) problèmes.push('accent');
  if (contraste(v['--muted'], v['--surface']) < 3) problèmes.push('discret');
  return problèmes;
}
