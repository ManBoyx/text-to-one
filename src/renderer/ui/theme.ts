export type Theme = 'light' | 'dark' | 'system';

const CLÉ = 'tto.theme';

export function getTheme(): Theme {
  try {
    const valeur = localStorage.getItem(CLÉ);
    if (valeur === 'light' || valeur === 'dark') return valeur;
  } catch {
    // Le stockage local peut être indisponible : on suit alors le thème du système.
  }
  return 'system';
}

export function applyTheme(theme: Theme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
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
