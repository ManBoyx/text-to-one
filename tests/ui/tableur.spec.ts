import { expect, test, type Page } from '@playwright/test';
import { packSheet } from '../../src/formats/sheet/tts';
import { emptySheet } from '../../src/formats/sheet/model';
import { envoyerMenu, installerFauxPont, journal, règler } from './fake-bridge';

const cellule = (page: Page, r: number, c: number) => page.locator(`.sg-cell[data-r="${r}"][data-c="${c}"]`);

async function ouvrirTableur(page: Page, init: unknown = { type: 'new', app: 'sheet' }) {
  await installerFauxPont(page, { init });
  await page.goto('/');
  await expect(page.locator('.sg')).toBeVisible();
}

/** Clique une cellule puis tape : chaque valeur se termine par Entrée, qui descend d'une cellule. */
async function saisir(page: Page, r: number, c: number, ...valeurs: string[]) {
  await cellule(page, r, c).click();
  for (const valeur of valeurs) {
    await page.keyboard.type(valeur);
    await page.keyboard.press('Enter');
  }
}

test.describe('tableur', () => {
  test("s'ouvre sur une grille vide avec la première cellule sélectionnée", async ({ page }) => {
    await ouvrirTableur(page);
    await expect(page.locator('.sh-name')).toHaveValue('A1');
    await expect(page.locator('.sg-colheads .sg-head').first()).toHaveText('A');
    await expect(page.locator('.sg-rowheads .sg-head').first()).toHaveText('1');
    await expect(page.locator('.status-count')).toHaveText('Prêt');
    await expect.poll(async () => (await journal(page)).états.at(-1)).toMatchObject({ app: 'sheet', name: 'Document sans titre', dirty: false });
  });

  test('saisie, formules en français et recalcul', async ({ page }) => {
    await ouvrirTableur(page);
    await saisir(page, 0, 0, '12', '30', '=SOMME(A1:A2)');
    await expect(cellule(page, 0, 0)).toHaveText('12');
    await expect(cellule(page, 2, 0)).toHaveText('42');
    await expect(cellule(page, 0, 0)).toHaveCSS('text-align', 'right');
    await saisir(page, 0, 0, '20');
    await expect(cellule(page, 2, 0)).toHaveText('50');
    await saisir(page, 0, 1, '2,5', 'bonjour', '=1/0');
    await expect(cellule(page, 0, 1)).toHaveText('2,5');
    await expect(cellule(page, 1, 1)).toHaveText('bonjour');
    await expect(cellule(page, 2, 1)).toHaveText('#DIV/0!');
    await expect.poll(async () => (await journal(page)).états.at(-1)?.dirty).toBe(true);
  });

  test('la barre de formule montre et modifie le contenu de la cellule', async ({ page }) => {
    await ouvrirTableur(page);
    await saisir(page, 0, 0, '5', '=A1*2');
    await cellule(page, 1, 0).click();
    await expect(page.locator('.sh-input')).toHaveValue('=A1*2');
    await expect(page.locator('.sh-name')).toHaveValue('A2');
    await page.locator('.sh-input').fill('=A1*3');
    await page.locator('.sh-input').press('Enter');
    await expect(cellule(page, 1, 0)).toHaveText('15');
    await page.locator('.sh-name').fill('C4');
    await page.locator('.sh-name').press('Enter');
    await expect(page.locator('.sh-name')).toHaveValue('C4');
    await expect(page.locator('.sg-active')).toHaveAttribute('data-address', 'C4');
  });

  test('navigation au clavier, sélection et statistiques', async ({ page }) => {
    await ouvrirTableur(page);
    await saisir(page, 0, 0, '1', '2', '3', '4');
    await cellule(page, 0, 0).click();
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator('.sh-name')).toHaveValue('A1:A3');
    await expect(page.locator('.status-count')).toHaveText('Nombre : 3 · Somme : 6 · Moyenne : 2');
    await page.keyboard.press('ArrowRight'); // repart de la cellule active (A1), pas de la fin de la sélection
    await expect(page.locator('.sh-name')).toHaveValue('B1');
    await page.keyboard.press('Tab');
    await expect(page.locator('.sh-name')).toHaveValue('C1');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.sh-name')).toHaveValue('B1');
    await cellule(page, 3, 0).click({ modifiers: ['Shift'] });
    await expect(page.locator('.sh-name')).toHaveValue('A1:B4'); // la sélection s'étend depuis la cellule active
    await page.keyboard.press('Control+a');
    await expect(page.locator('.sh-name')).toHaveValue(/^A1:Z200$/);
  });

  test('met en forme : gras, italique, alignement, couleurs et format des nombres', async ({ page }) => {
    await ouvrirTableur(page);
    await saisir(page, 0, 0, '0,256');
    await cellule(page, 0, 0).click();
    await page.keyboard.press('Control+b');
    await expect(cellule(page, 0, 0)).toHaveCSS('font-weight', '700');
    await expect(page.locator('[data-action="format:bold"]')).toHaveClass(/is-active/);
    await page.locator('[data-action="format:italic"]').click();
    await expect(cellule(page, 0, 0)).toHaveCSS('font-style', 'italic');
    await page.locator('[data-action="format:align-center"]').click();
    await expect(cellule(page, 0, 0)).toHaveCSS('text-align', 'center');
    await page.locator('.sh-format').selectOption('percent');
    await expect(cellule(page, 0, 0)).toHaveText('25,6 %');
    await page.locator('.tb-fill-color').click();
    await page.getByRole('button', { name: '#f59f00' }).click();
    await expect(cellule(page, 0, 0)).toHaveCSS('background-color', 'rgb(245, 159, 0)');
    await page.locator('.tb-text-color').click();
    await page.getByRole('button', { name: '#e03131' }).click();
    await expect(cellule(page, 0, 0)).toHaveCSS('color', 'rgb(224, 49, 49)');
    await page.keyboard.press('Control+b');
    await expect(cellule(page, 0, 0)).not.toHaveCSS('font-weight', '700');
  });

  test("copie, coupe et colle en décalant les formules, et recopie vers le bas", async ({ page }) => {
    await ouvrirTableur(page);
    await saisir(page, 0, 0, '2', '3', '4');
    await saisir(page, 0, 1, '=A1*10');
    await cellule(page, 0, 1).click();
    await page.keyboard.press('Control+c');
    await cellule(page, 1, 1).click();
    await page.keyboard.press('Control+v');
    await expect(cellule(page, 1, 1)).toHaveText('30');
    await page.locator('.sh-input').focus();
    await expect(page.locator('.sh-input')).toHaveValue('=A2*10');
    await cellule(page, 0, 1).click();
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Control+d');
    await expect(cellule(page, 2, 1)).toHaveText('40');
    await page.keyboard.press('Delete');
    await expect(cellule(page, 2, 1)).toHaveText('');
    await expect(cellule(page, 0, 0)).toHaveText('2');
  });

  test('colle du texte venu d\'une autre application', async ({ page }) => {
    await ouvrirTableur(page);
    await cellule(page, 1, 1).click();
    await page.evaluate(() => {
      const transfert = new DataTransfer();
      transfert.setData('text/plain', 'a\tb\r\n1\t2,5\r\n');
      document.querySelector('.sg-body')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfert, bubbles: true, cancelable: true }));
    });
    await expect(cellule(page, 1, 1)).toHaveText('a');
    await expect(cellule(page, 2, 2)).toHaveText('2,5');
    await expect(page.locator('.sh-name')).toHaveValue('B2:C3');
  });

  test('insère et supprime des lignes et des colonnes, les formules suivent', async ({ page }) => {
    await ouvrirTableur(page);
    await saisir(page, 0, 0, '1', '2', '=SOMME(A1:A2)');
    await cellule(page, 1, 0).click();
    await page.locator('[data-action="sheet:insert-row"]').click();
    await expect(cellule(page, 3, 0)).toHaveText('3');
    await page.locator('[data-action="sheet:insert-col"]').click();
    await expect(cellule(page, 3, 1)).toHaveText('3');
    await page.locator('[data-action="sheet:delete-col"]').click();
    await expect(cellule(page, 3, 0)).toHaveText('3');
    await page.locator('[data-action="sheet:delete-row"]').click();
    await expect(cellule(page, 2, 0)).toHaveText('3');
  });

  test('annule et rétablit', async ({ page }) => {
    await ouvrirTableur(page);
    await saisir(page, 0, 0, 'un');
    await saisir(page, 1, 0, 'deux');
    await cellule(page, 5, 5).click();
    await page.keyboard.press('Control+z');
    await expect(cellule(page, 1, 0)).toHaveText('');
    await expect(cellule(page, 0, 0)).toHaveText('un');
    await page.keyboard.press('Control+y');
    await expect(cellule(page, 1, 0)).toHaveText('deux');
    await page.locator('[data-action="edit:undo"]').click();
    await expect(cellule(page, 1, 0)).toHaveText('');
    await expect(page.locator('[data-action="edit:redo"]')).toBeEnabled();
  });

  test('Échap abandonne la saisie', async ({ page }) => {
    await ouvrirTableur(page);
    await saisir(page, 0, 0, 'garde');
    await cellule(page, 0, 0).click();
    await page.keyboard.type('perdu');
    await page.keyboard.press('Escape');
    await expect(cellule(page, 0, 0)).toHaveText('garde');
  });

  test('enregistre en .tts, exporte en Excel et en CSV, et ouvre un classeur', async ({ page }) => {
    await ouvrirTableur(page);
    await saisir(page, 0, 0, 'Prix', '12');
    await envoyerMenu(page, 'file:save');
    await envoyerMenu(page, 'file:export-xlsx');
    await envoyerMenu(page, 'file:export-csv');
    await expect.poll(async () => (await journal(page)).enregistrements.length).toBe(3);
    const j = await journal(page);
    expect(j.enregistrements.map((e) => e.kind).sort()).toEqual(['csv', 'tts', 'xlsx']);
    expect(j.enregistrements.find((e) => e.kind === 'tts')).toMatchObject({ suggestedName: 'Document sans titre.tts', signature: 'PK' });
    expect(j.enregistrements.find((e) => e.kind === 'xlsx')?.signature).toBe('PK');
    await règler(page, 'prochainEnregistrement', { status: 'error', message: 'Le disque est plein.' });
    await envoyerMenu(page, 'file:save');
    await expect(page.locator('.toast-error')).toContainText("Impossible d'enregistrer : Le disque est plein.");
  });

  test('ouvre un classeur .tts et un brouillon récupéré', async ({ page }) => {
    const doc = { ...emptySheet(), cells: { A1: 'Total', B1: '=SOMME(B2:B3)', B2: '5', B3: '7,5' }, styles: { A1: { b: true } } };
    await ouvrirTableur(page, { type: 'file', file: { path: '/d/Budget.tts', name: 'Budget.tts', bytes: Array.from(packSheet(doc)) } });
    await expect(cellule(page, 0, 0)).toHaveText('Total');
    await expect(cellule(page, 0, 0)).toHaveCSS('font-weight', '700');
    await expect(cellule(page, 0, 1)).toHaveText('12,5');
    await expect.poll(async () => (await journal(page)).états.at(-1)).toMatchObject({ app: 'sheet', name: 'Budget', dirty: false, path: '/d/Budget.tts' });
  });

  test('un fichier invalide ramène à l\'accueil avec un message clair', async ({ page }) => {
    await installerFauxPont(page, { init: { type: 'file', file: { path: '/d/faux.xlsx', name: 'faux.xlsx', bytes: [1, 2, 3] } } });
    await page.goto('/');
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.toast-error')).toContainText("n'est pas un classeur Excel valide");
  });

  test('défile dans une grande feuille sans tout afficher', async ({ page }) => {
    await ouvrirTableur(page);
    const nombre = await page.locator('.sg-cell').count();
    expect(nombre).toBeLessThan(2000); // 200 lignes × 26 colonnes = 5200 : seules les cellules visibles existent
    await page.locator('.sg-body').evaluate((e) => { e.scrollTop = 24 * 150; });
    await expect(cellule(page, 150, 0)).toBeVisible();
    await expect(cellule(page, 0, 0)).toHaveCount(0);
    await expect(page.locator('.sg-rowheads .sg-head').first()).not.toHaveText('1');
  });

  test('élargit une colonne en tirant son bord', async ({ page }) => {
    await ouvrirTableur(page);
    const avant = (await cellule(page, 0, 0).boundingBox())!.width;
    const bord = page.locator('.sg-colheads .sg-head[data-c="0"] .sg-resize');
    const boîte = (await bord.boundingBox())!;
    await page.mouse.move(boîte.x + boîte.width / 2, boîte.y + boîte.height / 2);
    await page.mouse.down();
    await page.mouse.move(boîte.x + 80, boîte.y + boîte.height / 2, { steps: 4 });
    await page.mouse.up();
    const après = (await cellule(page, 0, 0).boundingBox())!.width;
    expect(après).toBeGreaterThan(avant + 40);
    await expect(cellule(page, 0, 1)).toBeVisible();
  });

  test('la fenêtre étroite ne déborde pas', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await ouvrirTableur(page);
    const dépasse = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(dépasse).toBe(false);
    const dehors = await page.evaluate(() => [...document.querySelectorAll('.toolbar .tb-btn, .toolbar select')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length);
    expect(dehors).toBe(0);
  });
});
