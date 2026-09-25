import type { MenuAction, OpenedFile } from '../shared/bridge';

/** Ce que la coquille sait faire d'une application ouverte dans la fenêtre, quelle qu'elle soit. */
export interface AppSession {
  newDocument(): void;
  openFile(fichier: OpenedFile): Promise<boolean>;
  openRecovered(id: string, nom: string, octets: Uint8Array): Promise<boolean>;
  handleMenu(action: MenuAction): Promise<void>;
  dispose(): void;
}
