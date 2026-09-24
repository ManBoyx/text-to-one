/** Erreur dont le message est destiné à l'utilisateur, en français. */
export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}
