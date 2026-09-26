import { CLAIR, PALETTES, PERSONNALISÉ_PAR_DÉFAUT, SOMBRE, THEME_IDS, avertissements, variablesPersonnalisées, type Personnalisé, type ThemeId, type Variables } from '../../shared/themes';
import { fr } from '../fr';
import { el } from './dom';
import { getPersonnalisé, getTheme, setPersonnalisé, setTheme } from './theme';

const libellé = (id: ThemeId): string => {
  if (id === 'system') return fr.themes.system;
  if (id === 'light') return fr.themes.light;
  if (id === 'dark') return fr.themes.dark;
  if (id === 'custom') return fr.themes.custom;
  return PALETTES.find((p) => p.id === id)?.label ?? id;
};

/** Les couleurs à montrer dans la vignette d'un thème ; « Automatique » n'en a pas : on la coupe en deux, clair et sombre. */
function variablesDe(id: ThemeId, perso: Personnalisé): Variables | null {
  if (id === 'system') return null;
  if (id === 'light') return CLAIR;
  if (id === 'dark') return SOMBRE;
  if (id === 'custom') return variablesPersonnalisées(perso);
  return PALETTES.find((p) => p.id === id)?.variables ?? null;
}

function vignette(v: Variables): HTMLElement {
  const boîte = el('span', 'theme-preview');
  boîte.style.background = v['--bg'];
  boîte.style.borderColor = v['--border'];
  const barre = el('span', 'theme-preview-bar');
  barre.style.background = v['--surface'];
  barre.style.borderColor = v['--border'];
  const texte = el('i', 'theme-preview-text');
  texte.style.background = v['--text'];
  const accent = el('i', 'theme-preview-accent');
  accent.style.background = v['--accent'];
  barre.append(texte, accent);
  boîte.append(barre);
  return boîte;
}

/** La fenêtre des thèmes : une vignette par thème, et de quoi fabriquer le sien avec quatre couleurs. Le choix s'applique tout de suite. */
export function ouvrirThèmes(): Promise<void> {
  return new Promise((fin) => {
    const boîte = el('dialog', 'dialog theme-dialog');
    boîte.setAttribute('aria-labelledby', 'theme-titre');
    const formulaire = el('form', 'dialog-form');
    formulaire.method = 'dialog';
    const titre = el('h2', 'dialog-title', fr.themes.title);
    titre.id = 'theme-titre';
    const intro = el('p', 'theme-intro', fr.themes.intro);

    let perso = getPersonnalisé();
    const grille = el('div', 'theme-grid');
    grille.setAttribute('role', 'radiogroup');
    grille.setAttribute('aria-label', fr.themes.list);
    const cartes = new Map<ThemeId, HTMLButtonElement>();

    const marquer = () => {
      const courant = getTheme();
      for (const [id, carte] of cartes) {
        carte.setAttribute('aria-checked', String(id === courant));
        carte.classList.toggle('is-selected', id === courant);
      }
    };

    for (const id of THEME_IDS) {
      const carte = el('button', 'theme-card');
      carte.type = 'button';
      carte.setAttribute('role', 'radio');
      carte.dataset.theme = id;
      const v = variablesDe(id, perso);
      if (v) carte.append(vignette(v));
      else {
        const moitié = el('span', 'theme-preview theme-preview-split');
        moitié.append(vignette(CLAIR), vignette(SOMBRE));
        carte.append(moitié);
      }
      carte.append(el('span', 'theme-name', libellé(id)));
      if (id === 'system') carte.append(el('span', 'theme-hint', fr.themes.systemHint));
      carte.addEventListener('click', () => {
        setTheme(id);
        marquer();
      });
      cartes.set(id, carte);
      grille.append(carte);
    }

    // Le thème personnalisé : quatre couleurs, le reste s'en déduit.
    const perso_ = el('fieldset', 'theme-custom');
    perso_.append(el('legend', undefined, fr.themes.customTitle), el('p', 'theme-intro', fr.themes.customIntro));
    const champs: [keyof Personnalisé, string][] = [['fond', fr.themes.background], ['surface', fr.themes.surface], ['texte', fr.themes.text], ['accent', fr.themes.accent]];
    const entrées = new Map<keyof Personnalisé, HTMLInputElement>();
    const avis = el('p', 'theme-contrast');
    avis.setAttribute('role', 'status');

    const majAvis = () => {
      const problèmes = avertissements(variablesPersonnalisées(perso));
      const textes = { texte: fr.themes.lowText, accent: fr.themes.lowAccent, discret: fr.themes.lowMuted };
      avis.textContent = problèmes.length ? problèmes.map((p) => textes[p]).join(' ') : fr.themes.good;
      avis.classList.toggle('is-warning', problèmes.length > 0);
    };
    const majVignetteSurMesure = () => {
      const carte = cartes.get('custom');
      if (!carte) return;
      carte.firstElementChild?.replaceWith(vignette(variablesPersonnalisées(perso)));
    };
    for (const [clé, nom] of champs) {
      const étiquette = el('label', 'theme-color', nom);
      const entrée = el('input');
      entrée.type = 'color';
      entrée.value = perso[clé];
      entrée.addEventListener('input', () => {
        perso = { ...perso, [clé]: entrée.value };
        setPersonnalisé(perso);
        setTheme('custom');
        majVignetteSurMesure();
        majAvis();
        marquer();
      });
      étiquette.append(entrée);
      entrées.set(clé, entrée);
      perso_.append(étiquette);
    }
    const remise = el('button', 'btn', fr.themes.reset);
    remise.type = 'button';
    remise.addEventListener('click', () => {
      perso = { ...PERSONNALISÉ_PAR_DÉFAUT };
      for (const [clé, entrée] of entrées) entrée.value = perso[clé];
      setPersonnalisé(perso);
      if (getTheme() === 'custom') setTheme('custom');
      majVignetteSurMesure();
      majAvis();
    });
    perso_.append(avis, remise);

    const actions = el('div', 'dialog-actions');
    const fermer = el('button', 'btn btn-primary', fr.themes.close);
    fermer.type = 'submit';
    actions.append(fermer);
    formulaire.append(titre, intro, grille, perso_, actions);
    boîte.append(formulaire);
    boîte.addEventListener('close', () => {
      boîte.remove();
      fin();
    });
    marquer();
    majAvis();
    document.body.append(boîte);
    boîte.showModal();
    cartes.get(getTheme())?.focus();
  });
}
