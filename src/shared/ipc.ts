/** Les noms des canaux entre la fenêtre et le processus principal : un seul endroit pour ne pas se tromper. */
export const IPC = {
  init: 'tto:init',
  openDialog: 'tto:open-dialog',
  readRecent: 'tto:read-recent',
  save: 'tto:save',
  exportPdf: 'tto:export-pdf',
  listRecents: 'tto:list-recents',
  windowState: 'tto:window-state',
  writeRecovery: 'tto:write-recovery',
  clearRecovery: 'tto:clear-recovery',
  closeWindow: 'tto:close-window',
  openExternal: 'tto:open-external',
  menu: 'tto:menu',
  openRequest: 'tto:open-request',
} as const;
