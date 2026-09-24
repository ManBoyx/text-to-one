import { test } from '@playwright/test';
import { packTto } from '../../src/formats/tto';
import { sampleDoc } from '../formats/sample-doc';
import { installerFauxPont } from './fake-bridge';

// Ces captures illustrent le README. Elles ne se font que sur demande : CAPTURES=1 npm run test:ui
test.skip(!process.env.CAPTURES, 'captures seulement sur demande');

for (const thème of ['light', 'dark'] as const) {
  test(`captures du thème ${thème}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: thème });
    await installerFauxPont(page, { recents: [{ path: '/docs/Bilan 2025.tto', name: 'Bilan 2025.tto' }, { path: '/docs/Lettre.tto', name: 'Lettre.tto' }] });
    await page.goto('/');
    await page.screenshot({ path: `docs/captures/accueil-${thème}.png` });

    const éditeur = await page.context().newPage();
    await éditeur.emulateMedia({ colorScheme: thème });
    await installerFauxPont(éditeur, { init: { type: 'file', file: { path: '/docs/Bilan 2025.tto', name: 'Bilan 2025.tto', bytes: Array.from(packTto(sampleDoc)) } } });
    await éditeur.goto('/');
    await éditeur.locator('.ProseMirror h1').waitFor();
    await éditeur.screenshot({ path: `docs/captures/editeur-${thème}.png` });
  });
}
