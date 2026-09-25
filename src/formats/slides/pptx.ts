import PptxGenJS from 'pptxgenjs';
import { SLIDE_H, SLIDE_W, type ShapeObject, type SlidesDoc, type TextObject, type TextStyle } from './model';

const PIXELS_PAR_POUCE = 96;
const pouces = (px: number): number => px / PIXELS_PAR_POUCE;
const hex = (c: string): string => c.slice(1).toUpperCase();
const points = (px: number): number => Math.round(px * 0.75 * 10) / 10;

function optionsDeTexte(o: TextObject | ShapeObject, style: TextStyle) {
  return {
    x: pouces(o.x),
    y: pouces(o.y),
    w: pouces(o.w),
    h: pouces(o.h),
    fontSize: points(style.size),
    color: hex(style.color),
    bold: style.bold,
    italic: style.italic,
    underline: style.underline ? { style: 'sng' as const } : undefined,
    align: style.align,
    valign: (o.type === 'shape' ? 'middle' : 'top') as 'middle' | 'top',
    fontFace: 'Arial',
    margin: 0,
  };
}

/** Écrit une présentation PowerPoint (.pptx), en 16/9, avec zones de texte, formes et images. */
export async function exportPptx(doc: SlidesDoc, titre = 'Présentation'): Promise<Uint8Array> {
  const pres = new PptxGenJS();
  pres.author = 'Text to One';
  pres.company = 'Text to One';
  pres.title = titre;
  pres.subject = 'Présentation'; // la bibliothèque y met son propre nom par défaut
  pres.defineLayout({ name: 'TTO', width: pouces(SLIDE_W), height: pouces(SLIDE_H) });
  pres.layout = 'TTO';

  for (const d of doc.slides) {
    const diapo = pres.addSlide();
    diapo.background = { color: hex(d.background) };
    for (const o of d.objects) {
      if (o.type === 'text') {
        if (o.text.trim()) diapo.addText(o.text, optionsDeTexte(o, o.style));
      } else if (o.type === 'shape') {
        const contour = o.stroke ? { color: hex(o.stroke), width: points(o.strokeWidth) } : { type: 'none' as const };
        const fond = o.fill ? { color: hex(o.fill) } : { type: 'none' as const };
        diapo.addShape(o.shape === 'ellipse' ? pres.ShapeType.ellipse : pres.ShapeType.rect, {
          x: pouces(o.x),
          y: pouces(o.y),
          w: pouces(o.w),
          h: pouces(o.h),
          fill: fond,
          line: contour,
        });
        if (o.text.trim()) diapo.addText(o.text, optionsDeTexte(o, o.style));
      } else if (o.src.startsWith('data:image/')) {
        diapo.addImage({ data: o.src.slice('data:'.length), x: pouces(o.x), y: pouces(o.y), w: pouces(o.w), h: pouces(o.h), altText: o.alt });
      }
    }
  }
  const données = (await pres.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  return new Uint8Array(données);
}
