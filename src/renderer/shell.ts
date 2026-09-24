import type { Bridge, InitialRequest, MenuAction, RecentEntry } from '../shared/bridge';
import { créerSession, type EditorSession } from './editor/session';
import { fr } from './fr';
import { montrerAccueil } from './home';
import { setTheme } from './ui/theme';
import { showNotice } from './ui/toast';

/** La coquille de la fenêtre : montre l'accueil ou un document, et relaie ce que dit le processus principal. */
export class Shell {
  private session: EditorSession | null = null;

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
      onNew: () => void this.ouvrir({ type: 'new' }),
      onOpen: () => void this.ouvrirBoîte(),
      onOpenRecent: (entrée) => void this.ouvrirRécent(entrée),
    });
  }

  private async ouvrir(demande: InitialRequest): Promise<void> {
    this.session?.dispose();
    this.session = null;
    const session = créerSession(this.hôte, this.bridge, demande.type === 'recovered' ? { id: demande.id } : {});
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
