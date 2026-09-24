import type { Page } from '@playwright/test';

export interface OptionsPont {
  /** Ce que le processus principal répondrait à « init » : { type: 'new' }, un fichier… (octets en tableau de nombres). */
  init?: unknown;
  recents?: { path: string; name: string }[];
}

export interface Journal {
  enregistrements: { path: string | null; suggestedName: string; kind: string; taille: number; signature: string }[];
  états: { id: string; name: string; dirty: boolean; path: string | null }[];
  secours: { id: string; name: string; taille: number }[];
  effacés: string[];
  fermetures: number;
  liens: string[];
  pdf: string[];
}

/** Installe dans la page un faux pont qui remplace celui du processus principal, et note ce qu'on lui demande. */
export async function installerFauxPont(page: Page, options: OptionsPont = {}): Promise<void> {
  await page.addInitScript((opts) => {
    type Rappel = (valeur: unknown) => void;
    const menus: Rappel[] = [];
    const ouvertures: Rappel[] = [];
    // Playwright transmet les octets sous forme de tableaux de nombres : on les remet en Uint8Array.
    const octets = (v: any) => {
      if (v?.file && Array.isArray(v.file.bytes)) v.file.bytes = Uint8Array.from(v.file.bytes);
      if (v && Array.isArray(v.bytes)) v.bytes = Uint8Array.from(v.bytes);
      return v;
    };
    const journal = { enregistrements: [] as any[], états: [] as any[], secours: [] as any[], effacés: [] as string[], fermetures: 0, liens: [] as string[], pdf: [] as string[] };
    const scénario: any = {
      prochainEnregistrement: { status: 'saved', path: '/docs/essai.tto', name: 'essai.tto' },
      prochaineOuverture: { status: 'cancelled' },
    };
    (window as any).__faux = {
      journal,
      scénario,
      menu: (action: string) => menus.forEach((rappel) => rappel(action)),
      ouvrir: (demande: unknown) => ouvertures.forEach((rappel) => rappel(octets(demande))),
    };
    (window as any).tto = {
      init: async () => octets(opts.init ?? null),
      openDialog: async () => octets(scénario.prochaineOuverture),
      readRecent: async () => octets(scénario.prochaineOuverture),
      save: async (demande: any) => {
        journal.enregistrements.push({
          path: demande.path,
          suggestedName: demande.suggestedName,
          kind: demande.kind,
          taille: demande.bytes.length,
          signature: String.fromCharCode(demande.bytes[0], demande.bytes[1]),
        });
        return scénario.prochainEnregistrement;
      },
      exportPdf: async (nom: string) => {
        journal.pdf.push(nom);
        return { status: 'saved', path: `/docs/${nom}`, name: nom };
      },
      listRecents: async () => opts.recents ?? [],
      setWindowState: (état: unknown) => {
        journal.états.push(état);
      },
      writeRecovery: async (id: string, name: string, octetsÉcrits: Uint8Array) => {
        journal.secours.push({ id, name, taille: octetsÉcrits.length });
      },
      clearRecovery: async (id: string) => {
        journal.effacés.push(id);
      },
      closeWindow: () => {
        journal.fermetures++;
      },
      openExternal: (url: string) => {
        journal.liens.push(url);
      },
      onMenu: (rappel: Rappel) => {
        menus.push(rappel);
      },
      onOpenRequest: (rappel: Rappel) => {
        ouvertures.push(rappel);
      },
    };
  }, options);
}

export const journal = (page: Page): Promise<Journal> => page.evaluate(() => (window as any).__faux.journal);
export const envoyerMenu = (page: Page, action: string): Promise<void> => page.evaluate((a) => (window as any).__faux.menu(a), action);
export const règler = (page: Page, nom: string, valeur: unknown): Promise<void> =>
  page.evaluate(([n, v]) => { (window as any).__faux.scénario[n as string] = v; }, [nom, valeur]);
