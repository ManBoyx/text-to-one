import type { AppKind, SaveKind } from '../shared/kinds';

/** Ce qu'il faut à une application pour lire et écrire ses documents : le contrôleur ne connaît rien d'autre. */
export interface DocumentCodec<Doc> {
  app: AppKind;
  encode(kind: SaveKind, doc: Doc, title: string): Promise<Uint8Array>;
  /** `native` est vrai pour le format propre de l'application (enregistrable « en place »). */
  decode(fileName: string, bytes: Uint8Array): Promise<{ doc: Doc; warnings: string[]; native: boolean }>;
}
