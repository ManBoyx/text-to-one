import type { Bridge, SaveOutcome, SaveRequest, WindowState } from '../../src/shared/bridge';

/** Un pont de test : il note tout ce qu'on lui demande et répond ce qu'on lui a préparé. */
export interface FakeBridge extends Bridge {
  saves: SaveRequest[];
  states: WindowState[];
  recoveries: { id: string; name: string; size: number; app: string }[];
  cleared: string[];
  pdfs: string[];
  closed: number;
  nextSave: SaveOutcome;
  nextPdf: SaveOutcome;
}

export function createFakeBridge(): FakeBridge {
  const pont: FakeBridge = {
    saves: [],
    states: [],
    recoveries: [],
    cleared: [],
    pdfs: [],
    closed: 0,
    nextSave: { status: 'saved', path: '/docs/essai.tto', name: 'essai.tto' },
    nextPdf: { status: 'saved', path: '/docs/essai.pdf', name: 'essai.pdf' },
    init: async () => null,
    openDialog: async () => ({ status: 'cancelled' }),
    readRecent: async () => ({ status: 'cancelled' }),
    save: async (demande) => {
      pont.saves.push(demande);
      return pont.nextSave;
    },
    exportPdf: async (nom) => {
      pont.pdfs.push(nom);
      return pont.nextPdf;
    },
    listRecents: async () => [],
    setWindowState: (état) => {
      pont.states.push(état);
    },
    writeRecovery: async (id, name, bytes, app) => {
      pont.recoveries.push({ id, name, size: bytes.length, app });
    },
    clearRecovery: async (id) => {
      pont.cleared.push(id);
    },
    closeWindow: () => {
      pont.closed++;
    },
    openExternal: () => undefined,
    onMenu: () => undefined,
    onOpenRequest: () => undefined,
  };
  return pont;
}
