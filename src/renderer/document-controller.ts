import type { JSONContent } from '@tiptap/core';
import { FormatError, decodeDocument, encodeDocument } from '../formats';
import type { Bridge, OpenedFile, SaveOutcome } from '../shared/bridge';
import { KIND_INFO, type SaveKind } from '../shared/kinds';
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

export interface ControllerDeps {
  bridge: Bridge;
  getDoc: () => JSONContent;
  setDoc: (doc: JSONContent) => void;
  notify: (notice: Notice) => void;
  onState?: (state: DocState) => void;
  newId?: () => string;
}

const messageDe = (erreur: unknown, défaut: string): string => (erreur instanceof Error ? erreur.message : défaut);

/** Le document courant d'une fenêtre : son nom, son chemin, s'il est modifié, et tout ce qu'on peut en faire. */
export class DocumentController {
  readonly id: string;
  private path: string | null = null;
  private name: string = fr.untitled;
  private dirty = false;
  private révision = 0;
  private minuteur: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: ControllerDeps) {
    this.id = (deps.newId ?? (() => crypto.randomUUID()))();
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
      const { doc, warnings, source } = await decodeDocument(fichier.name, fichier.bytes);
      this.deps.setDoc(doc);
      // Un .docx ne s'enregistre pas « en place » : Enregistrer proposera un nouveau .tto.
      this.path = source === 'tto' ? fichier.path : null;
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
    const ouvert = await this.open({ path: '', name: `${nom}.tto`, bytes: octets });
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
      const octets = await encodeDocument('tto', this.deps.getDoc(), this.name);
      const résultat = await this.deps.bridge.save({ path: chemin, suggestedName: `${this.name}.tto`, kind: 'tto', bytes: octets });
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

  async exportAs(kind: Exclude<SaveKind, 'tto'>): Promise<boolean> {
    try {
      const octets = await encodeDocument(kind, this.deps.getDoc(), this.name);
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
      const octets = await encodeDocument('tto', this.deps.getDoc(), this.name);
      await this.deps.bridge.writeRecovery(this.id, this.name, octets);
    } catch {
      // Le brouillon n'est qu'un filet de sécurité : on ne dérange pas l'utilisateur s'il échoue.
    }
  }

  private publier(): void {
    this.deps.onState?.(this.state);
    this.deps.bridge.setWindowState({ id: this.id, ...this.state });
  }
}
