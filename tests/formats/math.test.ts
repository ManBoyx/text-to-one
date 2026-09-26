import type { JSONContent } from '@tiptap/core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { generateHTML, generateJSON } from '@tiptap/html';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../src/formats/docx-export';
import { importDocx } from '../../src/formats/docx-import';
import { toHtmlDocument, toMarkdown, toPlainText } from '../../src/formats/export-text';
import { packTto, unpackTto } from '../../src/formats/tto';
import { ommlEnLatex } from '../../src/formats/omml';
import { dessinerFormule, erreurFormule, formuleEnMathML, formuleValide } from '../../src/shared/math';
import { buildExtensions } from '../../src/shared/schema';

const doc = (...blocs: JSONContent[]): JSONContent => ({ type: 'doc', content: blocs });
const formule = (latex: string): JSONContent => ({ type: 'mathInline', attrs: { latex } });
const bloc = (latex: string): JSONContent => ({ type: 'mathBlock', attrs: { latex } });
const avecFormules = doc(
  { type: 'paragraph', content: [{ type: 'text', text: 'Soit ' }, formule('x^2 + 1'), { type: 'text', text: ' un nombre.' }] },
  bloc('\\frac{a}{b} = \\sqrt{2}'),
);

describe('formules : validation', () => {
  it('accepte une formule correcte et refuse les autres', () => {
    expect(formuleValide('\\frac{a}{b}')).toBe(true);
    expect(formuleValide('\\frac{a')).toBe(false);
    expect(formuleValide('   ')).toBe(false);
    expect(formuleValide('x'.repeat(2001))).toBe(false);
  });

  it("explique l'erreur sans le préfixe de KaTeX", () => {
    expect(erreurFormule('\\frac{a')).toBeTruthy();
    expect(erreurFormule('\\frac{a}{b}')).toBeNull();
    expect(erreurFormule('')).toBeNull();
  });

  it("n'écrit jamais de lien ni d'image, même si la formule en demande", () => {
    for (const latex of ['\\href{https://exemple.fr}{x}', '\\url{https://exemple.fr}', '\\includegraphics{x.png}', '\\htmlClass{a}{x}']) {
      const mathml = formuleEnMathML(latex, false);
      expect(mathml).not.toMatch(/<a[ >]|href=|<img|src=/);
    }
    const bureau = document.createElement('div');
    dessinerFormule(bureau, '\\href{https://exemple.fr}{x}', false);
    expect(bureau.querySelector('a, img')).toBeNull();
  });
});

describe('formules : document', () => {
  it("passent l'aller-retour HTML sans perdre le code", () => {
    const html = generateHTML(avecFormules, buildExtensions());
    const retour = generateJSON(html, buildExtensions());
    expect(retour.content[0].content[1]).toMatchObject({ type: 'mathInline', attrs: { latex: 'x^2 + 1' } });
    expect(retour.content[1]).toMatchObject({ type: 'mathBlock', attrs: { latex: '\\frac{a}{b} = \\sqrt{2}' } });
  });

  it('sont relues telles quelles depuis un fichier .tto', () => {
    expect(unpackTto(packTto(avecFormules))).toEqual(avecFormules);
  });
});

describe('formules : exports', () => {
  it('texte brut : le code LaTeX', () => {
    expect(toPlainText(avecFormules)).toBe('Soit x^2 + 1 un nombre.\n\n\\frac{a}{b} = \\sqrt{2}\n');
  });

  it('Markdown : $…$ dans le texte, $$…$$ sur sa ligne', () => {
    expect(toMarkdown(avecFormules)).toBe('Soit $x^2 + 1$ un nombre.\n\n$$\n\\frac{a}{b} = \\sqrt{2}\n$$\n');
  });

  it('page HTML : du MathML, sans code brut ni script', () => {
    const html = toHtmlDocument(avecFormules, 'Test');
    expect(html).toContain('<math');
    expect(html).toContain('display="block"');
    expect(html).not.toContain('data-latex');
    expect(html).not.toContain('<script');
  });

  it("page HTML : le code d'une formule ne peut pas injecter de balise", () => {
    const html = toHtmlDocument(doc({ type: 'paragraph', content: [formule('<img src=x onerror=alert(1)>')] }), 'Test');
    expect(html).not.toContain('<img');
  });

  it('Word : des objets mathématiques (OMML) pour les formules', async () => {
    const fichiers = unzipSync(await exportDocx(avecFormules));
    const xml = strFromU8(fichiers['word/document.xml']);
    expect(xml).toContain('<m:oMath>');
    expect(xml).toContain('<m:f>');
    expect(xml).toContain('<m:rad>');
    expect(xml).toContain('<m:sSup>');
  });

  it('Word : somme, intégrale, parenthèses et indices', async () => {
    const complexe = doc({ type: 'paragraph', content: [formule('\\sum_{i=1}^{n} x_i'), formule('\\int_0^1 f(x)\\,dx'), formule('\\left( a+b \\right)')] });
    const xml = strFromU8(unzipSync(await exportDocx(complexe))['word/document.xml']);
    expect(xml).toContain('<m:nary>');
    expect(xml).toContain('<m:d>');
    expect(xml).toContain('<m:sSub>');
  });

  it('Word : une formule invalide reste lisible en texte', async () => {
    const xml = strFromU8(unzipSync(await exportDocx(doc(bloc('\\frac{a'))))['word/document.xml']);
    expect(xml).toContain('\\frac{a');
  });
});

const ESPACES =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const docx = (corps: string): Uint8Array =>
  zipSync({ 'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${ESPACES}><w:body>${corps}</w:body></w:document>`) });
const mr = (t: string): string => `<m:r><m:t>${t}</m:t></m:r>`;

describe('formules : import Word', () => {
  it('relit une fraction et un exposant dans un paragraphe', () => {
    const { doc: résultat } = importDocx(
      docx(`<w:p><w:r><w:t xml:space="preserve">Soit </w:t></w:r><m:oMath><m:f><m:num>${mr('a')}</m:num><m:den>${mr('b')}</m:den></m:f></m:oMath><m:oMath><m:sSup><m:e>${mr('x')}</m:e><m:sup>${mr('2')}</m:sup></m:sSup></m:oMath></w:p>`),
    );
    const contenu = résultat.content?.[0].content ?? [];
    expect(contenu[1]).toMatchObject({ type: 'mathInline', attrs: { latex: '\\frac{a}{b}' } });
    expect(contenu[2]).toMatchObject({ type: 'mathInline', attrs: { latex: 'x^{2}' } });
  });

  it('une formule seule sur sa ligne devient une formule de bloc', () => {
    const { doc: résultat } = importDocx(
      docx(`<w:p><m:oMathPara><m:oMath><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${mr('2')}</m:e></m:rad></m:oMath></m:oMathPara></w:p>`),
    );
    expect(résultat.content?.[0]).toMatchObject({ type: 'mathBlock', attrs: { latex: '\\sqrt{2}' } });
  });

  it('relit somme, parenthèses et lettres grecques', () => {
    const { doc: résultat } = importDocx(
      docx(
        `<w:p><m:oMath><m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${mr('i=1')}</m:sub><m:sup>${mr('n')}</m:sup><m:e>${mr('α')}</m:e></m:nary></m:oMath></w:p>`,
      ),
    );
    expect(résultat.content?.[0].content?.[0].attrs?.latex).toBe('\\sum_{i=1}^{n} \\alpha');
  });

  it("fait l'aller-retour Word : la formule exportée est relue", async () => {
    const { doc: relu } = importDocx(await exportDocx(avecFormules));
    const contenu = relu.content ?? [];
    const latex = contenu.flatMap((b) => [b, ...(b.content ?? [])]).filter((n) => n.type?.startsWith('math')).map((n) => n.attrs?.latex);
    expect(latex).toEqual(['x^{2}+1', '\\frac{a}{b}=\\sqrt{2}']);
  });

  it('OMML : ne plante pas sur un élément inconnu et garde son texte', () => {
    const élément = new DOMParser().parseFromString(`<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:truc>${mr('y')}</m:truc></m:oMath>`, 'application/xml').documentElement;
    expect(ommlEnLatex(élément)).toBe('y');
  });
});
