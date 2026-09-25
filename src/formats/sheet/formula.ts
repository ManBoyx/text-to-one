import enGB from 'hyperformula/i18n/languages/enGB';
import frFR from 'hyperformula/i18n/languages/frFR';
import { colIndex, colName } from './model';

// Les tableurs écrivent les formules dans la langue de l'utilisateur (« =SOMME(A1;B1) » en français), mais les
// fichiers Excel les stockent en anglais (« SUM(A1,B1) »). Ces fonctions font la traduction.

const frVersEn = new Map<string, string>();
const enVersFr = new Map<string, string>();
for (const [canonique, nomFr] of Object.entries(frFR.functions)) {
  const nomEn = (enGB.functions as Record<string, string>)[canonique] ?? canonique;
  frVersEn.set(nomFr.toUpperCase(), nomEn);
  enVersFr.set(nomEn.toUpperCase(), nomFr);
}

/** Découpe une formule en morceaux de texte entre guillemets (à ne pas toucher) et morceaux de code. */
function morceaux(formule: string): { texte: boolean; valeur: string }[] {
  return [...formule.matchAll(/("(?:[^"]|"")*")|([^"]+)/g)].map((m) => ({ texte: m[1] !== undefined, valeur: m[0] }));
}

const NOM_DE_FONCTION = /([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*)(?=\()/g;

function traduireNoms(code: string, table: Map<string, string>): string {
  return code.replace(NOM_DE_FONCTION, (nom) => table.get(nom.toUpperCase()) ?? nom);
}

/** « =SI(A1>0,5;SOMME(A1:B1);"non, merci") » → « =IF(A1>0.5,SUM(A1:B1),"non, merci") ». */
export function frToEnFormula(formule: string): string {
  return morceaux(formule)
    .map(({ texte, valeur }) => {
      if (texte) return valeur;
      return traduireNoms(valeur, frVersEn).replace(/,/g, '.').replace(/;/g, ',');
    })
    .join('');
}

/** L'inverse : « =IF(A1>0.5,SUM(A1:B1),"non") » → « =SI(A1>0,5;SOMME(A1:B1);"non") ». */
export function enToFrFormula(formule: string): string {
  return morceaux(formule)
    .map(({ texte, valeur }) => {
      if (texte) return valeur;
      return traduireNoms(valeur, enVersFr)
        .replace(/,/g, ';')
        .replace(/(\d)\.(\d)/g, '$1,$2')
        .replace(/(^|[^\w.])\.(\d)/g, '$1,$2');
    })
    .join('');
}

/**
 * Décale les références relatives d'une formule (« =A1+B$2 » copiée une ligne plus bas devient « =A2+B$2 »),
 * comme quand on copie-colle ou qu'on recopie vers le bas. Une référence qui sortirait de la feuille devient #REF!.
 */
export function shiftReferences(formule: string, lignes: number, colonnes: number): string {
  return morceaux(formule)
    .map(({ texte, valeur }) => {
      if (texte) return valeur;
      return valeur.replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![\w(])/g, (tout, dc: string, col: string, dr: string, ligne: string, position: number, entier: string) => {
        if (position > 0 && /[A-Za-z0-9_.]/.test(entier[position - 1])) return tout; // milieu d'un mot : pas une référence
        const c = dc ? colIndex(col) : colIndex(col) + colonnes;
        const r = dr ? Number(ligne) - 1 : Number(ligne) - 1 + lignes;
        return c < 0 || r < 0 ? '#REF!' : `${dc}${colName(c)}${dr}${r + 1}`;
      });
    })
    .join('');
}
