import { el } from './dom';

export interface AskTextOptions {
  title: string;
  label: string;
  value?: string;
  confirm: string;
  cancel: string;
}

/**
 * Demande une ligne de texte dans une fenêtre modale. Le navigateur intégré d'Electron n'a pas de
 * `prompt()`, d'où cette petite fenêtre. Renvoie null si l'utilisateur annule ou appuie sur Échap.
 */
export function askText(options: AskTextOptions): Promise<string | null> {
  return new Promise((résoudre) => {
    const boîte = el('dialog', 'dialog');
    const formulaire = el('form', 'dialog-form');
    formulaire.method = 'dialog';
    const titre = el('h2', 'dialog-title', options.title);
    const étiquette = el('label', 'dialog-label', options.label);
    const champ = el('input', 'dialog-input');
    champ.type = 'text';
    champ.value = options.value ?? '';
    champ.spellcheck = false;
    étiquette.append(champ);
    const actions = el('div', 'dialog-actions');
    const annuler = el('button', 'btn', options.cancel);
    annuler.type = 'button';
    const valider = el('button', 'btn btn-primary', options.confirm);
    valider.type = 'submit';
    actions.append(annuler, valider);
    formulaire.append(titre, étiquette, actions);
    boîte.append(formulaire);

    let résultat: string | null = null;
    formulaire.addEventListener('submit', () => {
      résultat = champ.value;
    });
    annuler.addEventListener('click', () => boîte.close());
    boîte.addEventListener('close', () => {
      boîte.remove();
      résoudre(résultat);
    });
    document.body.append(boîte);
    boîte.showModal();
    champ.focus();
    champ.select();
  });
}
