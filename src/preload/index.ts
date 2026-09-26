import { contextBridge, ipcRenderer } from 'electron';
import { isMenuAction, type Bridge, type InitialRequest } from '../shared/bridge';
import { IPC } from '../shared/ipc';

/** Le seul pont entre la fenêtre et le processus principal : des fonctions fixes, aucun accès direct à Node. */
const pont: Bridge = {
  init: () => ipcRenderer.invoke(IPC.init),
  openDialog: () => ipcRenderer.invoke(IPC.openDialog),
  readRecent: (chemin) => ipcRenderer.invoke(IPC.readRecent, chemin),
  save: (demande) => ipcRenderer.invoke(IPC.save, demande),
  exportPdf: (nom) => ipcRenderer.invoke(IPC.exportPdf, nom),
  print: () => ipcRenderer.send(IPC.print),
  listRecents: () => ipcRenderer.invoke(IPC.listRecents),
  setWindowState: (état) => ipcRenderer.send(IPC.windowState, état),
  writeRecovery: (id, nom, octets, app) => ipcRenderer.invoke(IPC.writeRecovery, id, nom, octets, app),
  clearRecovery: (id) => ipcRenderer.invoke(IPC.clearRecovery, id),
  closeWindow: () => ipcRenderer.send(IPC.closeWindow),
  openExternal: (url) => ipcRenderer.send(IPC.openExternal, url),
  onMenu: (rappel) => {
    ipcRenderer.on(IPC.menu, (_événement, action: unknown) => {
      if (isMenuAction(action)) rappel(action);
    });
  },
  onOpenRequest: (rappel) => {
    ipcRenderer.on(IPC.openRequest, (_événement, demande: InitialRequest) => rappel(demande));
  },
};

contextBridge.exposeInMainWorld('tto', pont);
