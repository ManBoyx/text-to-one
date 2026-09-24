import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

/** Le menu du clic droit : suggestions du correcteur orthographique, puis couper / copier / coller. */
export function installerMenuContextuel(fenêtre: BrowserWindow): void {
  fenêtre.webContents.on('context-menu', (_événement, params) => {
    const éléments: MenuItemConstructorOptions[] = [];
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        éléments.push({ label: suggestion, click: () => fenêtre.webContents.replaceMisspelling(suggestion) });
      }
      if (!params.dictionarySuggestions.length) éléments.push({ label: 'Aucune suggestion', enabled: false });
      éléments.push(
        { label: 'Ajouter au dictionnaire', click: () => fenêtre.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) },
        { type: 'separator' },
      );
    }
    if (params.isEditable) {
      éléments.push(
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      );
    } else if (params.selectionText) {
      éléments.push({ role: 'copy', label: 'Copier' });
    }
    if (éléments.length) Menu.buildFromTemplate(éléments).popup({ window: fenêtre });
  });
}
