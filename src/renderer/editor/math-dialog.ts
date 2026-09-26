import { dessinerFormule, erreurFormule, MATH_MAX_LENGTH } from '../../shared/math';
import { fr } from '../fr';
import { el } from '../ui/dom';

export interface RésultatFormule {
  latex: string;
  bloc: boolean;
}

/** Les raccourcis proposés sous le champ : un clic écrit le code LaTeX correspondant. `▢` marque où taper ensuite. */
const EXTRAITS: { libellé: string; code: string; titre: string }[] = [
  { libellé: 'a⁄b', code: '\\frac{▢}{▢}', titre: 'Fraction' },
  { libellé: 'xⁿ', code: '^{▢}', titre: 'Exposant' },
  { libellé: 'xₙ', code: '_{▢}', titre: 'Indice' },
  { libellé: '√', code: '\\sqrt{▢}', titre: 'Racine carrée' },
  { libellé: 'ⁿ√', code: '\\sqrt[▢]{▢}', titre: 'Racine n-ième' },
  { libellé: '∑', code: '\\sum_{i=1}^{n} ▢', titre: 'Somme' },
  { libellé: '∫', code: '\\int_{a}^{b} ▢ \\, dx', titre: 'Intégrale' },
  { libellé: 'lim', code: '\\lim_{x \\to ▢}', titre: 'Limite' },
  { libellé: 'π', code: '\\pi', titre: 'pi' },
  { libellé: 'α', code: '\\alpha', titre: 'alpha' },
  { libellé: 'β', code: '\\beta', titre: 'bêta' },
  { libellé: 'θ', code: '\\theta', titre: 'thêta' },
  { libellé: 'Δ', code: '\\Delta', titre: 'delta majuscule' },
  { libellé: '≤', code: '\\leq', titre: 'Inférieur ou égal' },
  { libellé: '≥', code: '\\geq', titre: 'Supérieur ou égal' },
  { libellé: '≠', code: '\\neq', titre: 'Différent' },
  { libellé: '±', code: '\\pm', titre: 'Plus ou moins' },
  { libellé: '×', code: '\\times', titre: 'Multiplié par' },
  { libellé: '∞', code: '\\infty', titre: 'Infini' },
  { libellé: '→', code: '\\rightarrow', titre: 'Flèche' },
  { libellé: '( )', code: '\\left( ▢ \\right)', titre: 'Parenthèses qui s’adaptent' },
  { libellé: '▦', code: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', titre: 'Matrice' },
];

/**
 * La fenêtre de saisie d'une formule : un champ LaTeX, l'aperçu en direct, des raccourcis, et le choix
 * « dans le texte » ou « sur sa propre ligne ». Renvoie null si l'utilisateur annule.
 */
export function ouvrirFormule(départ: { latex: string; bloc: boolean; modification: boolean }): Promise<RésultatFormule | null> {
  return new Promise((résoudre) => {
    const boîte = el('dialog', 'dialog math-dialog');
    const formulaire = el('form', 'dialog-form');
    formulaire.method = 'dialog';
    const titre = el('h2', 'dialog-title', départ.modification ? fr.math.editTitle : fr.math.title);
    const intro = el('p', 'math-intro', fr.math.intro);

    const étiquette = el('label', 'dialog-label', fr.math.label);
    const champ = el('textarea', 'dialog-input math-input');
    champ.rows = 3;
    champ.value = départ.latex;
    champ.spellcheck = false;
    champ.maxLength = MATH_MAX_LENGTH;
    champ.setAttribute('autocomplete', 'off');
    étiquette.append(champ);

    const extraits = el('div', 'math-snippets');
    extraits.setAttribute('role', 'group');
    extraits.setAttribute('aria-label', fr.math.snippets);
    for (const extrait of EXTRAITS) {
      const bouton = el('button', 'math-snippet', extrait.libellé);
      bouton.type = 'button';
      bouton.title = extrait.titre;
      bouton.setAttribute('aria-label', extrait.titre);
      bouton.addEventListener('mousedown', (e) => e.preventDefault());
      bouton.addEventListener('click', () => {
        const début = champ.selectionStart;
        const fin = champ.selectionEnd;
        const sélection = champ.value.slice(début, fin);
        // La sélection actuelle prend la place du premier « ▢ », les autres sont laissés à remplir.
        const code = sélection ? extrait.code.replace('▢', sélection) : extrait.code;
        const première = code.indexOf('▢');
        const texte = code.replaceAll('▢', '');
        champ.setRangeText(texte, début, fin, 'end');
        const curseur = première >= 0 ? début + première : début + texte.length;
        champ.setSelectionRange(curseur, curseur);
        champ.focus();
        mettreÀJour();
      });
      extraits.append(bouton);
    }

    const aperçu = el('div', 'math-preview');
    aperçu.setAttribute('aria-live', 'polite');
    const erreur = el('p', 'math-error');
    erreur.setAttribute('role', 'status');

    const choix = el('fieldset', 'math-mode');
    const légende = el('legend', undefined, fr.math.mode);
    choix.append(légende);
    const option = (valeur: 'inline' | 'block', texte: string): HTMLInputElement => {
      const ligne = el('label', 'math-mode-option');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'math-mode';
      radio.value = valeur;
      radio.checked = (valeur === 'block') === départ.bloc;
      ligne.append(radio, document.createTextNode(texte));
      choix.append(ligne);
      return radio;
    };
    option('inline', fr.math.inline);
    const radioBloc = option('block', fr.math.block);

    const actions = el('div', 'dialog-actions');
    const annuler = el('button', 'btn', fr.dialog.cancel);
    annuler.type = 'button';
    const valider = el('button', 'btn btn-primary', fr.dialog.ok);
    valider.type = 'submit';
    actions.append(annuler, valider);

    const mettreÀJour = () => {
      const latex = champ.value;
      const message = erreurFormule(latex);
      erreur.textContent = message ?? '';
      valider.disabled = !latex.trim() || message !== null;
      aperçu.replaceChildren();
      if (!latex.trim()) {
        aperçu.append(el('span', 'math-placeholder', fr.math.empty));
        return;
      }
      if (message === null) dessinerFormule(aperçu, latex, radioBloc.checked);
    };
    champ.addEventListener('input', mettreÀJour);
    choix.addEventListener('change', mettreÀJour);

    formulaire.append(titre, intro, étiquette, extraits, aperçu, erreur, choix, actions);
    boîte.append(formulaire);

    let résultat: RésultatFormule | null = null;
    formulaire.addEventListener('submit', () => {
      if (!champ.value.trim() || erreurFormule(champ.value) !== null) return;
      résultat = { latex: champ.value.trim(), bloc: radioBloc.checked };
    });
    // Ctrl + Entrée valide sans quitter le clavier ; Entrée seule va à la ligne dans le champ.
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        formulaire.requestSubmit(valider);
      }
    });
    annuler.addEventListener('click', () => boîte.close());
    boîte.addEventListener('close', () => {
      boîte.remove();
      résoudre(résultat);
    });
    document.body.append(boîte);
    mettreÀJour();
    boîte.showModal();
    champ.focus();
  });
}
