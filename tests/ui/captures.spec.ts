import { test, type Page } from '@playwright/test';
import { emptySheet, type SheetDoc } from '../../src/formats/sheet/model';
import { packSheet } from '../../src/formats/sheet/tts';
import { forme, nouvelleDiapo, zoneDeTexte, type SlidesDoc } from '../../src/formats/slides/model';
import { packSlides } from '../../src/formats/slides/ttp';
import { packTto } from '../../src/formats/tto';
import { sampleDoc } from '../formats/sample-doc';
import { installerFauxPont } from './fake-bridge';

// Ces captures illustrent le README. Elles ne se font que sur demande : CAPTURES=1 npm run test:ui
test.skip(!process.env.CAPTURES, 'captures seulement sur demande');

const budget: SheetDoc = {
  ...emptySheet(),
  cells: { A1: 'Produit', B1: 'Quantité', C1: 'Prix', D1: 'Total', A2: 'Stylos', B2: '120', C2: '1,5', D2: '=B2*C2', A3: 'Cahiers', B3: '45', C3: '3,2', D3: '=B3*C3', A4: 'Classeurs', B4: '18', C4: '7,9', D4: '=B4*C4', A5: 'Total', D5: '=SOMME(D2:D4)', A7: 'Marge (15 %)', D7: '=D5*0,15' },
  styles: {
    ...Object.fromEntries(['A1', 'B1', 'C1', 'D1'].map((a) => [a, { b: true, f: '#1971c2', c: '#ffffff', ...(a === 'A1' ? {} : { a: 'right' as const }) }])),
    C2: { n: 'eur' }, C3: { n: 'eur' }, C4: { n: 'eur' }, D2: { n: 'eur' }, D3: { n: 'eur' }, D4: { n: 'eur' },
    A5: { b: true }, D5: { b: true, n: 'eur', f: '#fff3bf' }, D7: { n: 'eur', i: true },
  },
  colWidths: { '0': 140, '3': 130 },
};

function présentation(): SlidesDoc {
  const s1 = nouvelleDiapo('title');
  Object.assign(s1.objects[0], { text: 'Bilan 2025' });
  Object.assign(s1.objects[1], { text: 'Assemblée générale' });
  const s2 = nouvelleDiapo('content');
  Object.assign(s2.objects[0], { text: 'Nos résultats' });
  Object.assign(s2.objects[1], { text: "• Chiffre d'affaires : +12 %\n• Nouveaux clients : 340\n• Satisfaction : 94 %", w: 520 });
  const cercle = forme('ellipse', 640, 170, 240, 240);
  Object.assign(cercle, { fill: '#f59f00', text: '+12 %' });
  Object.assign(cercle.style, { size: 48, bold: true });
  s2.objects.push(cercle);
  const s3 = nouvelleDiapo('blank');
  s3.background = '#1d2330';
  s3.objects.push(zoneDeTexte(80, 200, 800, 120, 'Merci !', { size: 80, bold: true, align: 'center', color: '#ffffff' }));
  return { slides: [s1, s2, s3] };
}

const ouvrir = async (page: Page, nom: string, octets: Uint8Array) => {
  await installerFauxPont(page, { init: { type: 'file', file: { path: `/docs/${nom}`, name: nom, bytes: Array.from(octets) } } });
  await page.goto('/');
};

for (const thème of ['light', 'dark'] as const) {
  test(`captures du thème ${thème}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: thème });
    await installerFauxPont(page, { recents: [{ path: '/docs/Bilan 2025.tto', name: 'Bilan 2025.tto' }, { path: '/docs/Budget.tts', name: 'Budget.tts' }, { path: '/docs/Assemblée.ttp', name: 'Assemblée.ttp' }] });
    await page.goto('/');
    await page.screenshot({ path: `docs/captures/accueil-${thème}.png` });

    await ouvrir(page, 'Bilan 2025.tto', packTto(sampleDoc));
    await page.locator('.ProseMirror h1').waitFor();
    await page.screenshot({ path: `docs/captures/editeur-${thème}.png` });

    await ouvrir(page, 'Budget.tts', packSheet(budget));
    await page.locator('.sg-cell').first().waitFor();
    await page.locator('.sg-cell[data-r="4"][data-c="3"]').click();
    await page.locator('.sg-cell[data-r="1"][data-c="1"]').click({ modifiers: ['Shift'] });
    await page.screenshot({ path: `docs/captures/tableur-${thème}.png` });

    await ouvrir(page, 'Assemblée.ttp', packSlides(présentation()));
    await page.locator('.stage-canvas .obj').first().waitFor();
    await page.locator('.thumb').nth(1).click();
    await page.locator('.stage-canvas .obj-shape').click();
    await page.screenshot({ path: `docs/captures/presentation-${thème}.png` });
  });
}
