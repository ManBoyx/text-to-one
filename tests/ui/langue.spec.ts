import { expect, test } from '@playwright/test';
import { packTto } from '../../src/formats/tto';
import { sampleDoc } from '../formats/sample-doc';
import { installerFauxPont } from './fake-bridge';

// Des mots qui n'existent qu'en anglais : leur présence trahit un texte non traduit (les bibliothèques en injectent parfois).
const MOTS_ANGLAIS = /\b(the|and|task|item|checkbox|empty|write|something|insert|bold|italic|undo|redo|search|replace|close|save|cancel|open|loading|error|toolbar|paragraph|heading)\b/i;

async function textesDeLaPage(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const textes: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length === 0 && el.textContent?.trim()) textes.push(`texte : ${el.textContent.trim()}`);
      for (const nom of ['aria-label', 'title', 'placeholder', 'alt']) {
        const valeur = el.getAttribute(nom);
        if (valeur) textes.push(`${nom} : ${valeur}`);
      }
    }
    for (const option of document.querySelectorAll('option')) textes.push(`option : ${option.textContent}`);
    return textes;
  });
}

test.describe('langue', () => {
  test("l'accueil est entièrement en français", async ({ page }) => {
    await installerFauxPont(page, { recents: [{ path: '/docs/Bilan.tto', name: 'Bilan.tto' }] });
    await page.goto('/');
    await expect(page.locator('.card-active')).toBeVisible();
    const anglais = (await textesDeLaPage(page)).filter((t) => MOTS_ANGLAIS.test(t));
    expect(anglais).toEqual([]);
  });

  test("l'éditeur est entièrement en français, libellés d'accessibilité compris", async ({ page }) => {
    await installerFauxPont(page, { init: { type: 'file', file: { path: '/d/a.tto', name: 'a.tto', bytes: Array.from(packTto(sampleDoc)) } } });
    await page.goto('/');
    await page.locator('.ProseMirror h1').waitFor();
    const anglais = (await textesDeLaPage(page)).filter((t) => MOTS_ANGLAIS.test(t));
    expect(anglais).toEqual([]);
    await expect(page.locator('.ProseMirror input[type="checkbox"]').first()).toHaveAttribute('aria-label', 'Case à cocher : fait');
  });
});
