import type { JSONContent } from '@tiptap/core';
import { generateHTML } from '@tiptap/html';
import { buildExtensions } from '../shared/schema';

type Noeud = JSONContent;

const enfants = (n: Noeud): Noeud[] => n.content ?? [];

// ---------- Texte brut ----------

function texteEnLigne(n: Noeud): string {
  return enfants(n)
    .map((c) => {
      if (c.type === 'text') return c.text ?? '';
      if (c.type === 'hardBreak') return '\n';
      if (c.type === 'image') return '';
      return texteEnLigne(c);
    })
    .join('');
}

function élémentTexte(liste: Noeud, item: Noeud, index: number, retrait: string): string[] {
  const marque =
    liste.type === 'orderedList'
      ? `${Number(liste.attrs?.start ?? 1) + index}. `
      : liste.type === 'taskList'
        ? item.attrs?.checked ? '[x] ' : '[ ] '
        : '• ';
  const [premier, ...reste] = enfants(item);
  const tête = premier ? blocTexte(premier, '') : [''];
  const lignes = [retrait + marque + tête[0], ...tête.slice(1).map((l) => retrait + ' '.repeat(marque.length) + l)];
  for (const suite of reste) lignes.push(...blocTexte(suite, retrait + '  '));
  return lignes;
}

function blocTexte(n: Noeud, retrait: string): string[] {
  switch (n.type) {
    case 'paragraph':
    case 'heading':
    case 'codeBlock':
      return texteEnLigne(n).split('\n').map((ligne) => retrait + ligne);
    case 'blockquote':
      return enfants(n).flatMap((c) => blocTexte(c, retrait));
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return enfants(n).flatMap((item, i) => élémentTexte(n, item, i, retrait));
    case 'horizontalRule':
      return [`${retrait}---`];
    case 'pageBreak':
      return [''];
    case 'table':
      return enfants(n).map(
        (ligne) => retrait + enfants(ligne).map((cellule) => enfants(cellule).map(texteEnLigne).join(' ')).join('\t'),
      );
    default:
      return [];
  }
}

export function toPlainText(doc: Noeud): string {
  const blocs = enfants(doc).map((b) => blocTexte(b, '').join('\n'));
  return blocs.length ? `${blocs.join('\n\n')}\n` : '';
}

// ---------- Markdown ----------

const échapperMd = (s: string): string => s.replace(/([\\`*_[\]])/g, '\\$1');

/** Met les marques autour du mot et laisse les espaces de bord à l'extérieur, sinon Markdown ne les comprend pas. */
function envelopper(texte: string, marque: string): string {
  const morceaux = /^(\s*)([\s\S]*?)(\s*)$/.exec(texte);
  if (!morceaux || !morceaux[2]) return texte;
  return `${morceaux[1]}${marque}${morceaux[2]}${marque}${morceaux[3]}`;
}

function mdTexte(n: Noeud): string {
  const marques = new Set((n.marks ?? []).map((m) => m.type));
  let sortie = marques.has('code') ? `\`${n.text ?? ''}\`` : échapperMd(n.text ?? '');
  if (!marques.has('code')) {
    if (marques.has('bold')) sortie = envelopper(sortie, '**');
    if (marques.has('italic')) sortie = envelopper(sortie, '*');
    if (marques.has('strike')) sortie = envelopper(sortie, '~~');
  }
  const lien = (n.marks ?? []).find((m) => m.type === 'link');
  if (lien?.attrs?.href) sortie = `[${sortie}](${lien.attrs.href})`;
  return sortie;
}

function mdEnLigne(n: Noeud): string {
  return enfants(n)
    .map((c) => {
      if (c.type === 'text') return mdTexte(c);
      if (c.type === 'hardBreak') return '  \n';
      if (c.type === 'image') return `![${échapperMd(String(c.attrs?.alt ?? ''))}]()`;
      return mdEnLigne(c);
    })
    .join('');
}

function mdListe(liste: Noeud): string[] {
  const sortie: string[] = [];
  enfants(liste).forEach((item, i) => {
    const marque =
      liste.type === 'orderedList'
        ? `${Number(liste.attrs?.start ?? 1) + i}. `
        : liste.type === 'taskList'
          ? `- [${item.attrs?.checked ? 'x' : ' '}] `
          : '- ';
    const marge = ' '.repeat(liste.type === 'taskList' ? 2 : marque.length);
    const intérieur = enfants(item).flatMap((b, j) => (j === 0 ? mdBloc(b) : [...(b.type === 'paragraph' ? [''] : []), ...mdBloc(b)]));
    intérieur.forEach((ligne, k) => sortie.push(k === 0 ? marque + ligne : ligne ? marge + ligne : ''));
  });
  return sortie;
}

function mdTableau(table: Noeud): string[] {
  const lignes = enfants(table).map((ligne) =>
    enfants(ligne).map((cellule) => enfants(cellule).map(mdEnLigne).join('<br>').replace(/\|/g, '\\|')),
  );
  if (!lignes.length) return [];
  const largeur = Math.max(...lignes.map((l) => l.length));
  const écrire = (l: string[]) => `| ${Array.from({ length: largeur }, (_, i) => l[i] ?? '').join(' | ')} |`;
  return [écrire(lignes[0]), `| ${Array(largeur).fill('---').join(' | ')} |`, ...lignes.slice(1).map(écrire)];
}

function mdBloc(n: Noeud): string[] {
  switch (n.type) {
    case 'heading':
      return [`${'#'.repeat(Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1))))} ${mdEnLigne(n)}`];
    case 'paragraph':
      return [mdEnLigne(n)];
    case 'blockquote':
      return mdBlocs(enfants(n)).map((l) => (l ? `> ${l}` : '>'));
    case 'codeBlock':
      return ['```' + String(n.attrs?.language ?? ''), ...enfants(n).map((c) => c.text ?? '').join('').split('\n'), '```'];
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return mdListe(n);
    case 'horizontalRule':
      return ['---'];
    case 'pageBreak':
      return ['<!-- saut de page -->'];
    case 'table':
      return mdTableau(n);
    default:
      return [];
  }
}

function mdBlocs(noeuds: Noeud[]): string[] {
  return noeuds.flatMap((b, i) => (i ? ['', ...mdBloc(b)] : mdBloc(b)));
}

export function toMarkdown(doc: Noeud): string {
  const lignes = mdBlocs(enfants(doc));
  return lignes.length ? `${lignes.join('\n')}\n` : '';
}

// ---------- Page HTML ----------

const STYLE_PAGE = `body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;line-height:1.4;max-width:800px;margin:2rem auto;padding:0 1rem;color:#1f2328}
table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px;vertical-align:top}th{background:#f2f2f2}
blockquote{border-left:3px solid #aaa;margin-left:0;padding-left:1rem;color:#555}pre{background:#f3f3f3;padding:.6rem;overflow:auto}
img{max-width:100%}hr{border:0;border-top:1px solid #999}mark{color:inherit}
ul[data-type=taskList]{list-style:none;padding-left:0}li[data-type=taskItem]{display:flex;gap:.5rem}li[data-type=taskItem]>div{flex:1}input[type=checkbox]{pointer-events:none}
.page-break{break-after:page}`;

const échapperHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toHtmlDocument(doc: Noeud, title: string): string {
  const corps = generateHTML(doc, buildExtensions());
  return `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<title>${échapperHtml(title)}</title>\n<style>${STYLE_PAGE}</style>\n</head>\n<body>\n${corps}\n</body>\n</html>\n`;
}
