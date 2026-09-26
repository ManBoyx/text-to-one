/**
 * Lit une formule de Word (OMML) et l'écrit en LaTeX. Les éléments courants sont couverts : fractions, exposants
 * et indices, racines, sommes et intégrales, parenthèses, fonctions, limites, accents, matrices. Le reste est lu
 * pour son texte, afin qu'aucune formule ne soit perdue.
 */

const SYMBOLES: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\epsilon', ζ: '\\zeta', η: '\\eta', θ: '\\theta', ι: '\\iota', κ: '\\kappa',
  λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi', ρ: '\\rho', σ: '\\sigma', τ: '\\tau', υ: '\\upsilon', φ: '\\varphi', χ: '\\chi',
  ψ: '\\psi', ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi', Σ: '\\Sigma', Φ: '\\Phi',
  Ψ: '\\Psi', Ω: '\\Omega', '×': '\\times', '÷': '\\div', '±': '\\pm', '∓': '\\mp', '·': '\\cdot', '⋅': '\\cdot', '∞': '\\infty',
  '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≈': '\\approx', '≡': '\\equiv', '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊆': '\\subseteq',
  '∪': '\\cup', '∩': '\\cap', '→': '\\rightarrow', '←': '\\leftarrow', '⇒': '\\Rightarrow', '⇔': '\\Leftrightarrow', '∀': '\\forall',
  '∃': '\\exists', '∂': '\\partial', '∇': '\\nabla', '∅': '\\emptyset', '…': '\\ldots', '−': '-', '′': "'", '°': '^{\\circ}',
  '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint',
};
const FONCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'dim', 'ker', 'arg']);
const ACCENTS: Record<string, string> = { '̂': '\\hat', '^': '\\hat', '̃': '\\tilde', '~': '\\tilde', '¯': '\\overline', '̄': '\\overline', '→': '\\vec', '⃗': '\\vec', '̇': '\\dot', '̈': '\\ddot' };
const DÉLIMITEURS: Record<string, string> = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil', '': '.' };

const nom = (e: Element): string => e.localName;
const fils = (e: Element | undefined | null, n?: string): Element[] => (e ? Array.from(e.children).filter((c) => !n || nom(c) === n) : []);
const un = (e: Element | undefined | null, n: string): Element | undefined => fils(e, n)[0];
const valeur = (e: Element | undefined): string | null => (e ? (e.getAttribute('m:val') ?? e.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/math', 'val')) : null);

/** Les caractères qui ont un sens spécial en LaTeX, et les symboles Unicode, écrits en commandes. */
function texteEnLatex(t: string): string {
  let sortie = '';
  for (const c of t) {
    const s = SYMBOLES[c];
    if (s) sortie += `${s} `;
    else if ('{}%#&_$'.includes(c)) sortie += `\\${c}`;
    else if (c === '\\') sortie += '\\backslash ';
    else if (c === '^') sortie += '\\wedge ';
    else if (c === '~') sortie += '\\sim ';
    else sortie += c;
  }
  return sortie;
}

/** L'argument d'une commande : l'élément « corps » de OMML (e, num, den, sub, sup, deg, lim, fName). */
const groupe = (e: Element | undefined): string => `{${e ? fils(e).map(convertir).join('') : ''}}`;

/** La base d'un exposant ou d'un indice : sans accolades quand c'est un seul caractère (x^{2} et non {x}^{2}). */
function base(e: Element | undefined): string {
  const contenu = e ? fils(e).map(convertir).join('').trim() : '';
  return /^[A-Za-z0-9]$/.test(contenu) ? contenu : `{${contenu}}`;
}

function convertir(e: Element): string {
  switch (nom(e)) {
    case 'r': {
      const t = fils(e, 't').map((x) => x.textContent ?? '').join('');
      const normal = valeur(un(un(e, 'rPr'), 'nor')) === '1' || valeur(un(un(e, 'rPr'), 'sty')) === 'p';
      const brut = texteEnLatex(t);
      return normal && /^[A-Za-z]{2,}$/.test(t) ? (FONCTIONS.has(t) ? `\\${t} ` : `\\mathrm{${t}}`) : brut;
    }
    case 'f': {
      const barre = valeur(un(un(e, 'fPr'), 'type'));
      const [num, den] = [un(e, 'num'), un(e, 'den')];
      return barre === 'noBar' ? `{${groupe(num)} \\atop ${groupe(den)}}` : `\\frac${groupe(num)}${groupe(den)}`;
    }
    case 'sSup':
      return `${base(un(e, 'e'))}^${groupe(un(e, 'sup'))}`;
    case 'sSub':
      return `${base(un(e, 'e'))}_${groupe(un(e, 'sub'))}`;
    case 'sSubSup':
      return `${base(un(e, 'e'))}_${groupe(un(e, 'sub'))}^${groupe(un(e, 'sup'))}`;
    case 'sPre':
      return `{}_${groupe(un(e, 'sub'))}^${groupe(un(e, 'sup'))}${groupe(un(e, 'e'))}`;
    case 'rad': {
      const sansDegré = valeur(un(un(e, 'radPr'), 'degHide')) === '1' || !(un(e, 'deg')?.children.length);
      return sansDegré ? `\\sqrt${groupe(un(e, 'e'))}` : `\\sqrt[${fils(un(e, 'deg')).map(convertir).join('')}]${groupe(un(e, 'e'))}`;
    }
    case 'nary': {
      const propriétés = un(e, 'naryPr');
      const signe = valeur(un(propriétés, 'chr')) ?? '∫';
      const commande = (SYMBOLES[signe] ?? '\\int').trim();
      const bas = valeur(un(propriétés, 'subHide')) === '1' ? '' : fils(un(e, 'sub')).map(convertir).join('');
      const haut = valeur(un(propriétés, 'supHide')) === '1' ? '' : fils(un(e, 'sup')).map(convertir).join('');
      return `${commande}${bas ? `_{${bas}}` : ''}${haut ? `^{${haut}}` : ''} ${fils(un(e, 'e')).map(convertir).join('')}`;
    }
    case 'd': {
      const propriétés = un(e, 'dPr');
      const ouvrant = valeur(un(propriétés, 'begChr')) ?? '(';
      const fermant = valeur(un(propriétés, 'endChr')) ?? ')';
      const séparateur = valeur(un(propriétés, 'sepChr')) ?? '|';
      const corps = fils(e, 'e').map((x) => fils(x).map(convertir).join('')).join(texteEnLatex(séparateur));
      return `\\left${DÉLIMITEURS[ouvrant] ?? '('} ${corps} \\right${DÉLIMITEURS[fermant] ?? ')'}`;
    }
    case 'func': {
      const nomFonction = fils(un(e, 'fName')).map(convertir).join('').trim();
      const simple = nomFonction.replace(/^\\mathrm\{|\}$/g, '');
      const commande = FONCTIONS.has(simple) ? `\\${simple}` : nomFonction.startsWith('\\') ? nomFonction : `\\operatorname{${simple}}`;
      return `${commande} ${fils(un(e, 'e')).map(convertir).join('')}`;
    }
    case 'limLow':
      return `${fils(un(e, 'e')).map(convertir).join('')}_${groupe(un(e, 'lim'))}`;
    case 'limUpp':
      return `${fils(un(e, 'e')).map(convertir).join('')}^${groupe(un(e, 'lim'))}`;
    case 'acc': {
      const signe = valeur(un(un(e, 'accPr'), 'chr')) ?? '̂';
      return `${ACCENTS[signe] ?? '\\hat'}${groupe(un(e, 'e'))}`;
    }
    case 'bar':
      return `${valeur(un(un(e, 'barPr'), 'pos')) === 'bot' ? '\\underline' : '\\overline'}${groupe(un(e, 'e'))}`;
    case 'm': {
      const lignes = fils(e, 'mr').map((l) => fils(l, 'e').map((c) => fils(c).map(convertir).join('')).join(' & '));
      return `\\begin{matrix} ${lignes.join(' \\\\ ')} \\end{matrix}`;
    }
    case 'eqArr':
      return `\\begin{aligned} ${fils(e, 'e').map((l) => fils(l).map(convertir).join('')).join(' \\\\ ')} \\end{aligned}`;
    // Les propriétés ne portent aucun contenu.
    case 'rPr':
    case 'ctrlPr':
    case 'fPr':
    case 'dPr':
    case 'naryPr':
    case 'radPr':
    case 'accPr':
    case 'barPr':
      return '';
    default:
      return fils(e).map(convertir).join('');
  }
}

/** Le LaTeX d'un élément « m:oMath » ; une chaîne vide s'il ne contient rien. */
export function ommlEnLatex(formule: Element): string {
  return fils(formule).map(convertir).join('').replace(/\s+/g, ' ').trim();
}

/** Le texte brut d'une formule, quand le LaTeX obtenu n'est pas lisible par KaTeX. */
export function ommlEnTexte(formule: Element): string {
  return Array.from(formule.getElementsByTagNameNS('*', 't')).map((t) => t.textContent ?? '').join('');
}
