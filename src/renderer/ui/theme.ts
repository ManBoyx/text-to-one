import { PALETTES, PERSONNALISÉ_PAR_DÉFAUT, VARIABLES, estSombre, isThemeId, lirePersonnalisé, variablesPersonnalisées, type Personnalisé, type ThemeId } from '../../shared/themes';

/** « system » suit le thème du système ; « light » et « dark » sont dans styles/base.css ; les autres viennent de shared/themes. */
export type Theme = ThemeId;

const CLÉ = 'tto.theme';
const CLÉ_PERSONNALISÉ = 'tto.theme.custom';

export function getTheme(): Theme {
  try {
    const valeur = localStorage.getItem(CLÉ);
    if (isThemeId(valeur) && valeur !== 'system') return valeur;
  } catch {
    // Le stockage local peut être indisponible : on suit alors le thème du système.
  }
  return 'system';
}

export function getPersonnalisé(): Personnalisé {
  try {
    return lirePersonnalisé(JSON.parse(localStorage.getItem(CLÉ_PERSONNALISÉ) ?? 'null'));
  } catch {
    return { ...PERSONNALISÉ_PAR_DÉFAUT };
  }
}

export function setPersonnalisé(valeurs: Personnalisé): void {
  try {
    localStorage.setItem(CLÉ_PERSONNALISÉ, JSON.stringify(valeurs));
  } catch {
    // Sans stockage, le choix ne vaut que pour cette session.
  }
}

export function applyTheme(theme: Theme, personnalisé: Personnalisé = getPersonnalisé()): void {
  const racine = document.documentElement;
  for (const variable of VARIABLES) racine.style.removeProperty(variable);
  racine.style.removeProperty('color-scheme');
  if (theme === 'system') {
    racine.removeAttribute('data-theme');
    return;
  }
  racine.dataset.theme = theme;
  if (theme === 'light' || theme === 'dark') return;
  const palette = PALETTES.find((p) => p.id === theme);
  const variables = theme === 'custom' ? variablesPersonnalisées(personnalisé) : palette?.variables;
  if (!variables) return;
  for (const variable of VARIABLES) racine.style.setProperty(variable, variables[variable]);
  racine.style.setProperty('color-scheme', (theme === 'custom' ? estSombre(personnalisé) : palette?.dark) ? 'dark' : 'light');
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(CLÉ);
    else localStorage.setItem(CLÉ, theme);
  } catch {
    // Sans stockage, le choix ne vaut que pour cette session.
  }
  applyTheme(theme);
}

export function applyStoredTheme(): void {
  applyTheme(getTheme());
}
