import {
  Math as MathWord,
  MathAngledBrackets,
  MathCurlyBrackets,
  MathFraction,
  MathIntegral,
  MathLimitLower,
  MathLimitUpper,
  MathRadical,
  MathRoundBrackets,
  MathRun,
  MathSquareBrackets,
  MathSubScript,
  MathSubSuperScript,
  MathSum,
  MathSuperScript,
  type MathComponent,
} from 'docx';
import { formuleEnMathML } from '../shared/math';

/**
 * Word écrit ses formules en OMML ; on part du MathML que KaTeX produit (déjà en Unicode, sans code LaTeX à
 * interpréter) et on le traduit vers les éléments équivalents de la bibliothèque « docx ». Ce qui n'a pas
 * d'équivalent (matrices, accents…) est écrit à plat : la formule reste lisible, sans la mise en forme.
 */

const SOMMES = new Set(['∑', '∏']);
const INTÉGRALES = new Set(['∫', '∬', '∭', '∮']);
const FERMANTS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '⟨': '⟩', '⌊': '⌋', '⌈': '⌉' };

const nom = (e: Element): string => e.localName;
const fils = (e: Element): Element[] => Array.from(e.children);
const texte = (e: Element): string => (e.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Le seul opérateur d'un élément « mo » (∑, ∫…), ou null. */
const opérateur = (e: Element | undefined): string | null => (e && nom(e) === 'mo' ? texte(e) : null);

function enveloppe(ouvrant: string, contenu: MathComponent[]): MathComponent[] {
  switch (ouvrant) {
    case '(':
      return [new MathRoundBrackets({ children: contenu })];
    case '[':
      return [new MathSquareBrackets({ children: contenu })];
    case '{':
      return [new MathCurlyBrackets({ children: contenu })];
    case '⟨':
      return [new MathAngledBrackets({ children: contenu })];
    default:
      return [new MathRun(ouvrant), ...contenu];
  }
}

function suite(noeuds: Element[]): MathComponent[] {
  const sortie: MathComponent[] = [];
  for (let i = 0; i < noeuds.length; i++) {
    const n = noeuds[i];
    // Somme ou intégrale : tout ce qui suit dans la ligne en est le corps.
    const base = nom(n) === 'msubsup' || nom(n) === 'msub' || nom(n) === 'msup' || nom(n) === 'munderover' || nom(n) === 'munder' || nom(n) === 'mover' ? fils(n)[0] : undefined;
    const op = opérateur(base);
    if (op && (SOMMES.has(op) || INTÉGRALES.has(op))) {
      const [, a, b] = fils(n);
      const bas = nom(n) === 'msup' || nom(n) === 'mover' ? undefined : a;
      const haut = nom(n) === 'msup' || nom(n) === 'mover' ? a : b;
      const options = {
        children: suite(noeuds.slice(i + 1)),
        ...(bas ? { subScript: convertir(bas) } : {}),
        ...(haut ? { superScript: convertir(haut) } : {}),
      };
      sortie.push(SOMMES.has(op) ? new MathSum(options) : new MathIntegral(options));
      return sortie;
    }
    sortie.push(...convertir(n));
  }
  return sortie;
}

function convertir(e: Element): MathComponent[] {
  const f = fils(e);
  switch (nom(e)) {
    case 'mi':
    case 'mn':
    case 'mo':
    case 'mtext': {
      const t = texte(e);
      return t ? [new MathRun(t)] : [];
    }
    case 'mspace':
      return [new MathRun(' ')];
    case 'mrow': {
      const premier = opérateur(f[0]);
      const dernier = opérateur(f[f.length - 1]);
      if (f.length >= 2 && premier && dernier && FERMANTS[premier] === dernier && f[0].getAttribute('fence') === 'true') {
        return enveloppe(premier, suite(f.slice(1, -1)));
      }
      return suite(f);
    }
    case 'mfrac':
      return [new MathFraction({ numerator: convertir(f[0]), denominator: convertir(f[1]) })];
    case 'msup':
      return [new MathSuperScript({ children: convertir(f[0]), superScript: convertir(f[1]) })];
    case 'msub':
      return [new MathSubScript({ children: convertir(f[0]), subScript: convertir(f[1]) })];
    case 'msubsup':
      return [new MathSubSuperScript({ children: convertir(f[0]), subScript: convertir(f[1]), superScript: convertir(f[2]) })];
    case 'munder':
      return [new MathLimitLower({ children: convertir(f[0]), limit: convertir(f[1]) })];
    case 'mover':
      return [new MathLimitUpper({ children: convertir(f[0]), limit: convertir(f[1]) })];
    case 'munderover':
      return [new MathSubSuperScript({ children: convertir(f[0]), subScript: convertir(f[1]), superScript: convertir(f[2]) })];
    case 'msqrt':
      return [new MathRadical({ children: suite(f) })];
    case 'mroot':
      return [new MathRadical({ children: convertir(f[0]), degree: convertir(f[1]) })];
    case 'mtable': {
      // Pas d'élément de matrice dans la bibliothèque : lignes à plat, cellules séparées par des espaces.
      const lignes = f.map((ligne) => fils(ligne).map(texte).join('  ')).filter(Boolean);
      return lignes.length ? [new MathRun(lignes.join(' ; '))] : [];
    }
    case 'annotation':
    case 'annotation-xml':
      return [];
    default:
      return suite(f);
  }
}

/** La formule LaTeX en éléments Word ; null si elle est invalide ou ne donne rien. */
export function formuleEnWord(latex: string): MathWord | null {
  try {
    const document = new DOMParser().parseFromString(formuleEnMathML(latex, false), 'text/html');
    const racine = document.querySelector('math');
    if (!racine) return null;
    // <math><semantics><mrow>…</mrow><annotation/></semantics></math>
    const source = racine.querySelector('semantics') ?? racine;
    const enfants = fils(source).filter((c) => nom(c) !== 'annotation' && nom(c) !== 'annotation-xml');
    const composants = suite(enfants);
    return composants.length ? new MathWord({ children: composants }) : null;
  } catch {
    return null;
  }
}
