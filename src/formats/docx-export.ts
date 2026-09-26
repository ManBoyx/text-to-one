import type { JSONContent } from '@tiptap/core';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Math as MathWord,
  Packer,
  PageBreak as SautDePage,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
} from 'docx';
import { dataUrlToBytes, readImageSize } from './images';
import { formuleEnWord } from './math-docx';

type Noeud = JSONContent;
type Bloc = Paragraph | Table;
type EnLigne = TextRun | ExternalHyperlink | ImageRun | MathWord;

const enfants = (n: Noeud): Noeud[] => n.content ?? [];

const LARGEUR_MAX_IMAGE = 600; // pixels : environ la largeur utile d'une page A4
const POLICE_PAR_DÉFAUT = 'Arial';

const TYPES_IMAGE: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

const ALIGNEMENTS: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const TITRES = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

const FAMILLES_GÉNÉRIQUES: Record<string, string> = { 'sans-serif': 'Arial', serif: 'Times New Roman', monospace: 'Courier New' };

/** Donne les numéros de liste : chaque liste numérotée reçoit sa propre instance pour repartir de 1. */
class Contexte {
  private compteur = 0;
  nouvelleInstance(): number {
    return ++this.compteur;
  }
}

/** « #f00 », « #ff0000 » ou « rgb(255, 0, 0) » → « FF0000 » ; undefined si la couleur n'est pas reconnue. */
export function couleurEnHex(css: unknown): string | undefined {
  if (typeof css !== 'string') return undefined;
  const c = css.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return m[1].toUpperCase();
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (m) return `${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toUpperCase();
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
  if (m) return [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase();
  return undefined;
}

/** « 12pt » ou « 16px » → demi-points, l'unité de Word (12 pt = 24). Sans unité, on compte en points. */
export function demiPoints(taille: unknown): number | undefined {
  if (typeof taille !== 'string') return undefined;
  const m = /^([\d.]+)\s*(px|pt)?$/i.exec(taille.trim());
  if (!m) return undefined;
  const valeur = Number(m[1]);
  return Math.round(m[2]?.toLowerCase() === 'px' ? valeur * 1.5 : valeur * 2);
}

function nomDePolice(famille: unknown): string | undefined {
  if (typeof famille !== 'string' || !famille.trim()) return undefined;
  const premier = famille.split(',')[0].replace(/["']/g, '').trim();
  return FAMILLES_GÉNÉRIQUES[premier.toLowerCase()] ?? (premier || undefined);
}

/** Les options de la bibliothèque sont en lecture seule ; on les remplit ici avant de les lui donner. */
type Modifiable<T> = { -readonly [K in keyof T]: T[K] };

function optionsDeTexte(marques: Noeud['marks'] = []): IRunOptions {
  const o: Modifiable<IRunOptions> = {};
  for (const m of marques) {
    switch (m.type) {
      case 'bold':
        o.bold = true;
        break;
      case 'italic':
        o.italics = true;
        break;
      case 'underline':
        o.underline = {};
        break;
      case 'strike':
        o.strike = true;
        break;
      case 'superscript':
        o.superScript = true;
        break;
      case 'subscript':
        o.subScript = true;
        break;
      case 'code':
        o.font = 'Courier New';
        break;
      case 'highlight':
        o.shading = { type: ShadingType.CLEAR, color: 'auto', fill: couleurEnHex(m.attrs?.color) ?? 'FFFF00' };
        break;
      case 'textStyle': {
        const couleur = couleurEnHex(m.attrs?.color);
        if (couleur) o.color = couleur;
        const police = nomDePolice(m.attrs?.fontFamily);
        if (police) o.font = police;
        const taille = demiPoints(m.attrs?.fontSize);
        if (taille) o.size = taille;
        break;
      }
      case 'link':
        o.color ??= '0563C1';
        o.underline ??= {};
        break;
    }
  }
  return o;
}

function segmentDeTexte(texte: string, options: IRunOptions): TextRun {
  const morceaux = texte.split('\t');
  if (morceaux.length === 1) return new TextRun({ ...options, text: texte });
  return new TextRun({ ...options, children: morceaux.flatMap((m, i) => (i === 0 ? [m] : [new Tab(), m])) });
}

function imageWord(noeud: Noeud): EnLigne {
  const décodée = dataUrlToBytes(String(noeud.attrs?.src ?? ''));
  const type = décodée ? TYPES_IMAGE[décodée.mime] : undefined;
  if (!décodée || !type) return new TextRun('[image non prise en charge]');
  const naturelle = readImageSize(décodée.bytes) ?? { width: 300, height: 200 };
  let largeur = Number(noeud.attrs?.width) || naturelle.width;
  let hauteur = Number(noeud.attrs?.height) || Math.round((largeur * naturelle.height) / naturelle.width);
  if (largeur > LARGEUR_MAX_IMAGE) {
    hauteur = Math.round((hauteur * LARGEUR_MAX_IMAGE) / largeur);
    largeur = LARGEUR_MAX_IMAGE;
  }
  return new ImageRun({
    type,
    data: décodée.bytes,
    transformation: { width: largeur, height: hauteur },
    altText: { name: 'image', description: String(noeud.attrs?.alt ?? ''), title: '' },
  });
}

/** Une formule en objet mathématique de Word ; si elle n'est pas convertible, son code LaTeX en texte. */
function formuleWord(noeud: Noeud): EnLigne {
  const latex = String(noeud.attrs?.latex ?? '');
  return formuleEnWord(latex) ?? new TextRun(latex);
}

function enLigne(noeud: Noeud): EnLigne[] {
  const sortie: EnLigne[] = [];
  for (const c of enfants(noeud)) {
    if (c.type === 'text') {
      const course = segmentDeTexte(c.text ?? '', optionsDeTexte(c.marks));
      const href = c.marks?.find((m) => m.type === 'link')?.attrs?.href;
      sortie.push(typeof href === 'string' ? new ExternalHyperlink({ link: href, children: [course] }) : course);
    } else if (c.type === 'hardBreak') {
      sortie.push(new TextRun({ break: 1 }));
    } else if (c.type === 'image') {
      sortie.push(imageWord(c));
    } else if (c.type === 'mathInline') {
      sortie.push(formuleWord(c));
    }
  }
  return sortie;
}

function paragraphe(noeud: Noeud, extra: Partial<IParagraphOptions> = {}, préfixe = ''): Paragraph {
  const alignement = ALIGNEMENTS[String(noeud.attrs?.textAlign ?? '')];
  const interligne = parseFloat(String(noeud.attrs?.lineHeight ?? ''));
  const niveau = Math.min(6, Math.max(1, Number(noeud.attrs?.level ?? 1)));
  return new Paragraph({
    ...(noeud.type === 'heading' ? { heading: TITRES[niveau - 1] } : {}),
    ...(alignement ? { alignment: alignement } : {}),
    ...(interligne > 0 ? { spacing: { line: Math.round(interligne * 240), lineRule: LineRuleType.AUTO } } : {}),
    ...extra,
    children: [...(préfixe ? [new TextRun(préfixe)] : []), ...enLigne(noeud)],
  });
}

function blocDeCode(noeud: Noeud, extra: Partial<IParagraphOptions>): Paragraph {
  const lignes = enfants(noeud).map((c) => c.text ?? '').join('').split('\n');
  return new Paragraph({
    ...extra,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F3' },
    children: lignes.map((ligne, i) => new TextRun({ text: ligne, font: 'Courier New', size: 20, ...(i ? { break: 1 } : {}) })),
  });
}

const estListe = (n: Noeud): boolean => n.type === 'bulletList' || n.type === 'orderedList' || n.type === 'taskList';

function liste(noeud: Noeud, ctx: Contexte, niveau: number, instance: number): Bloc[] {
  const tâches = noeud.type === 'taskList';
  const ordonnée = noeud.type === 'orderedList';
  const n = Math.min(niveau, 8);
  const sortie: Bloc[] = [];
  for (const item of enfants(noeud)) {
    const [premier, ...suite] = enfants(item);
    const préfixe = tâches ? (item.attrs?.checked ? '☑ ' : '☐ ') : '';
    const options: Partial<IParagraphOptions> = tâches
      ? { indent: { left: 720 * (n + 1), hanging: 360 } }
      : { numbering: { reference: ordonnée ? 'tto-ordonnee' : 'tto-puces', level: n, instance } };
    if (premier && (premier.type === 'paragraph' || premier.type === 'heading')) sortie.push(paragraphe(premier, options, préfixe));
    else if (premier) sortie.push(...blocs([premier], ctx));
    for (const autre of suite) {
      if (estListe(autre)) sortie.push(...liste(autre, ctx, niveau + 1, ctx.nouvelleInstance()));
      else sortie.push(...blocs([autre], ctx, { indent: { left: 720 * (n + 1) } }));
    }
  }
  return sortie;
}

function tableau(noeud: Noeud, ctx: Contexte): Table {
  const lignes = enfants(noeud);
  const colonnes = Math.max(1, enfants(lignes[0] ?? {}).reduce((somme, c) => somme + (Number(c.attrs?.colspan) || 1), 0));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: Array(colonnes).fill(Math.floor(9000 / colonnes)),
    rows: lignes.map((ligne) => {
      const cellules = enfants(ligne);
      return new TableRow({
        tableHeader: cellules.length > 0 && cellules.every((c) => c.type === 'tableHeader'),
        children: cellules.map((cellule) => {
          const contenu = blocs(enfants(cellule), ctx);
          if (!contenu.length || contenu[contenu.length - 1] instanceof Table) contenu.push(new Paragraph(''));
          const colspan = Number(cellule.attrs?.colspan) || 1;
          const rowspan = Number(cellule.attrs?.rowspan) || 1;
          return new TableCell({
            ...(colspan > 1 ? { columnSpan: colspan } : {}),
            ...(rowspan > 1 ? { rowSpan: rowspan } : {}),
            ...(cellule.type === 'tableHeader' ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' } } : {}),
            children: contenu,
          });
        }),
      });
    }),
  });
}

function blocs(noeuds: Noeud[], ctx: Contexte, extra: Partial<IParagraphOptions> = {}): Bloc[] {
  return noeuds.flatMap((n): Bloc[] => {
    switch (n.type) {
      case 'paragraph':
      case 'heading':
        return [paragraphe(n, extra)];
      case 'blockquote':
        return blocs(enfants(n), ctx, {
          ...extra,
          indent: { left: 720 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'AAAAAA', space: 8 } },
        });
      case 'mathBlock':
        return [new Paragraph({ ...extra, alignment: AlignmentType.CENTER, children: [formuleWord(n)] })];
      case 'codeBlock':
        return [blocDeCode(n, extra)];
      case 'horizontalRule':
        return [new Paragraph({ ...extra, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } } })];
      case 'pageBreak':
        return [new Paragraph({ children: [new SautDePage()] })];
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return liste(n, ctx, 0, ctx.nouvelleInstance());
      case 'table':
        return enfants(n).length ? [tableau(n, ctx)] : [];
      default:
        return [];
    }
  });
}

function configurationDesListes() {
  const puces = ['•', '◦', '▪'];
  const formats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  const niveaux = (numérotée: boolean) =>
    Array.from({ length: 9 }, (_, level) => ({
      level,
      format: numérotée ? formats[level % 3] : LevelFormat.BULLET,
      text: numérotée ? `%${level + 1}.` : puces[level % 3],
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
    }));
  return [
    { reference: 'tto-puces', levels: niveaux(false) },
    { reference: 'tto-ordonnee', levels: niveaux(true) },
  ];
}

/** Produit un fichier .docx (A4, marges de 2,54 cm, Arial 11 pt par défaut). */
export async function exportDocx(doc: Noeud): Promise<Uint8Array> {
  const contenu = blocs(enfants(doc), new Contexte());
  const document = new Document({
    creator: 'Text to One',
    lastModifiedBy: 'Text to One',
    numbering: { config: configurationDesListes() },
    styles: { default: { document: { run: { font: POLICE_PAR_DÉFAUT, size: 22 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: contenu.length ? contenu : [new Paragraph('')],
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
