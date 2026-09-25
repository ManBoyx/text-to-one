import type { JSONContent } from '@tiptap/core';
import type { DocumentCodec } from '../formats/codec';
import { FormatError, textCodec } from '../formats';
import type { Bridge, OpenedFile, SaveOutcome } from '../shared/bridge';
import { KIND_INFO, NATIVE_KIND, type AppKind, type SaveKind } from '../shared/kinds';
import { stripExtension } from '../shared/names';
import { fr } from './fr';

export interface Notice {
  kind: 'info' | 'warning' | 'error';
  text: string;
}

export interface DocState {
  name: string;
  dirty: boolean;
  path: string | null;
}

export interface ControllerDeps<Doc = JSONContent> {
  bridge: Bridge;
  /** Comment lire et écrire les documents de l'application ; le traitement de texte par défaut. */
  codec?: DocumentCodec<Doc>;
  getDoc: () => Doc;
  setDoc: (doc: Doc) => void;
  notify: (notice: Notice) => void;
  onState?: (state: DocState) => void;
  newId?: () => string;
}

const messageDe = (erreur: unknown, défaut: string): string => (erreur instanceof Error ? erreur.message : défaut);

/** Le document courant d'une fenêtre : son nom, son chemin, s'il est modifié, et tout ce qu'on peut en faire. */
export class DocumentController<Doc = JSONContent> {
  readonly id: string;
  readonly app: AppKind;
  private readonly codec: DocumentCodec<Doc>;
  private readonly natif: SaveKind;
  private path: string | null = null;
  private name: string = fr.untitled;
  private dirty = false;
  private révision = 0;
  private minuteur: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: ControllerDeps<Doc>) {
    this.id = (deps.newId ?? (() => crypto.randomUUID()))();
    this.codec = deps.codec ?? (textCodec as unknown as DocumentCodec<Doc>);
    this.app = this.codec.app;
    this.natif = NATIVE_KIND[this.app];
    this.publier();
  }

  get state(): DocState {
    return { name: this.name, dirty: this.dirty, path: this.path };
  }

  /** À appeler à chaque modification faite par l'utilisateur. */
  markDirty(): void {
    this.révision++;
    if (this.dirty) return;
    this.dirty = true;
    this.publier();
  }

  async open(fichier: OpenedFile): Promise<boolean> {
    try {
      const { doc, warnings, native } = await this.codec.decode(fichier.name, fichier.bytes);
      this.deps.setDoc(doc);
      // Un fichier importé (Word, Excel…) ne s'enregistre pas « en place » : Enregistrer proposera un nouveau fichier au format propre.
      this.path = native ? fichier.path : null;
      this.name = stripExtension(fichier.name);
      this.dirty = false;
      this.révision++;
      this.publier();
      for (const texte of warnings) this.deps.notify({ kind: 'warning', text: texte });
      return true;
    } catch (erreur) {
      const message = erreur instanceof FormatError ? erreur.message : fr.errors.openUnknown;
      this.deps.notify({ kind: 'error', text: message });
      return false;
    }
  }

  /** Un brouillon retrouvé après une fermeture inattendue : modifié, et sans chemin. */
  async openRecovered(nom: string, octets: Uint8Array): Promise<boolean> {
    const ouvert = await this.open({ path: '', name: `${nom}.${KIND_INFO[this.natif].extension}`, bytes: octets });
    if (ouvert) {
      this.path = null;
      this.dirty = true;
      this.publier();
    }
    return ouvert;
  }

  save(): Promise<boolean> {
    return this.écrire(this.path);
  }

  saveAs(): Promise<boolean> {
    return this.écrire(null);
  }

  private async écrire(chemin: string | null): Promise<boolean> {
    const révisionEnvoyée = this.révision;
    try {
      const octets = await this.codec.encode(this.natif, this.deps.getDoc(), this.name);
      const résultat = await this.deps.bridge.save({
        path: chemin,
        suggestedName: `${this.name}.${KIND_INFO[this.natif].extension}`,
        kind: this.natif,
        bytes: octets,
      });
      if (résultat.status === 'cancelled') return false;
      if (résultat.status === 'error') {
        this.deps.notify({ kind: 'error', text: fr.errors.save(résultat.message) });
        return false;
      }
      this.path = résultat.path;
      this.name = stripExtension(résultat.name);
      this.dirty = this.révision !== révisionEnvoyée; // le texte a pu changer pendant l'enregistrement
      this.publier();
      if (!this.dirty) await this.deps.bridge.clearRecovery(this.id).catch(() => undefined);
      return true;
    } catch (erreur) {
      this.deps.notify({ kind: 'error', text: fr.errors.save(messageDe(erreur, fr.errors.unknown)) });
      return false;
    }
  }

  async exportAs(kind: SaveKind): Promise<boolean> {
    try {
      const octets = await this.codec.encode(kind, this.deps.getDoc(), this.name);
      const résultat = await this.deps.bridge.save({
        path: null,
        suggestedName: `${this.name}.${KIND_INFO[kind].extension}`,
        kind,
        bytes: octets,
      });
      return this.conclureExport(résultat);
    } catch (erreur) {
      this.deps.notify({ kind: 'error', text: fr.errors.export(messageDe(erreur, fr.errors.unknown)) });
      return false;
    }
  }

  async exportPdf(): Promise<boolean> {
    try {
      return this.conclureExport(await this.deps.bridge.exportPdf(`${this.name}.pdf`));
    } catch (erreur) {
      this.deps.notify({ kind: 'error', text: fr.errors.export(messageDe(erreur, fr.errors.unknown)) });
      return false;
    }
  }

  private conclureExport(résultat: SaveOutcome): boolean {
    if (résultat.status === 'cancelled') return false;
    if (résultat.status === 'error') {
      this.deps.notify({ kind: 'error', text: fr.errors.export(résultat.message) });
      return false;
    }
    this.deps.notify({ kind: 'info', text: fr.notice.exported(résultat.name) });
    return true;
  }

  startAutosave(intervalle = 30_000): void {
    this.stopAutosave();
    this.minuteur = setInterval(() => void this.brouillon(), intervalle);
  }

  stopAutosave(): void {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
  }

  dispose(): void {
    this.stopAutosave();
  }

  private async brouillon(): Promise<void> {
    if (!this.dirty) return;
    try {
      const octets = await this.codec.encode(this.natif, this.deps.getDoc(), this.name);
      await this.deps.bridge.writeRecovery(this.id, this.name, octets, this.app);
    } catch {
      // Le brouillon n'est qu'un filet de sécurité : on ne dérange pas l'utilisateur s'il échoue.
    }
  }

  private publier(): void {
    this.deps.onState?.(this.state);
    this.deps.bridge.setWindowState({ id: this.id, ...this.state, app: this.app });
  }
}
