import type { Bridge, InitialRequest, MenuAction, RecentEntry } from '../shared/bridge';
import { appForFileName, type AppKind } from '../shared/kinds';
import type { AppSession } from './app-session';
import { créerSession } from './editor/session';
import { créerSessionTableur } from './sheet/session';
import { fr } from './fr';
import { montrerAccueil } from './home';
import { setTheme } from './ui/theme';
import { showNotice } from './ui/toast';

/** La coquille de la fenêtre : montre l'accueil ou un document, et relaie ce que dit le processus principal. */
export class Shell {
  private session: AppSession | null = null;

  constructor(
    private readonly hôte: HTMLElement,
    private readonly bridge: Bridge,
  ) {}

  async start(): Promise<void> {
    this.bridge.onMenu((action) => void this.surMenu(action));
    this.bridge.onOpenRequest((demande) => void this.ouvrir(demande));
    const initiale = await this.bridge.init();
    if (initiale) await this.ouvrir(initiale);
    else this.afficherAccueil();
  }

  private afficherAccueil(): void {
    this.session?.dispose();
    this.session = null;
    this.bridge.setWindowState({ id: 'accueil', name: fr.app, dirty: false, path: null });
    void montrerAccueil(this.hôte, this.bridge, {
      onNew: (app) => void this.ouvrir({ type: 'new', app }),
      onOpen: () => void this.ouvrirBoîte(),
      onOpenRecent: (entrée) => void this.ouvrirRécent(entrée),
    });
  }

  private async ouvrir(demande: InitialRequest): Promise<void> {
    const app: AppKind | null = demande.type === 'file' ? appForFileName(demande.file.name) : (demande.app ?? 'text');
    if (!app) {
      showNotice({ kind: 'error', text: fr.errors.unsupported(demande.type === 'file' ? demande.file.name : '') });
      if (!this.session) this.afficherAccueil();
      return;
    }
    this.session?.dispose();
    this.session = null;
    const session = this.créer(app, demande.type === 'recovered' ? { id: demande.id } : {});
    let réussi = true;
    if (demande.type === 'file') réussi = await session.openFile(demande.file);
    else if (demande.type === 'recovered') réussi = await session.openRecovered(demande.id, demande.name, demande.bytes);
    else session.newDocument();
    if (!réussi) {
      // L'erreur a déjà été montrée à l'utilisateur ; on revient à l'accueil plutôt que de laisser une page vide.
      session.dispose();
      this.afficherAccueil();
      return;
    }
    this.session = session;
  }

  private créer(app: AppKind, options: { id?: string }): AppSession {
    if (app === 'sheet') return créerSessionTableur(this.hôte, this.bridge, options);
    return créerSession(this.hôte, this.bridge, options);
  }

  private async ouvrirBoîte(): Promise<void> {
    const résultat = await this.bridge.openDialog();
    if (résultat.status === 'opened') await this.ouvrir({ type: 'file', file: résultat.file });
    else if (résultat.status === 'error') showNotice({ kind: 'error', text: résultat.message });
  }

  private async ouvrirRécent(entrée: RecentEntry): Promise<void> {
    const résultat = await this.bridge.readRecent(entrée.path);
    if (résultat.status === 'opened') await this.ouvrir({ type: 'file', file: résultat.file });
    else if (résultat.status === 'error') showNotice({ kind: 'error', text: résultat.message });
  }

  private async surMenu(action: MenuAction): Promise<void> {
    if (action === 'view:theme-light') return setTheme('light');
    if (action === 'view:theme-dark') return setTheme('dark');
    if (action === 'view:theme-system') return setTheme('system');
    await this.session?.handleMenu(action);
  }
}
