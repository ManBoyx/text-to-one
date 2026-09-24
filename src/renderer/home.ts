import { FileText, FolderOpen, Presentation, Sheet } from 'lucide';
import type { Bridge, RecentEntry } from '../shared/bridge';
import { fr } from './fr';
import { el, icône } from './ui/dom';

export interface GestionnairesAccueil {
  onNew(): void;
  onOpen(): void;
  onOpenRecent(entrée: RecentEntry): void;
}

type Icône = Parameters<typeof icône>[0];

function carte(icon: Icône, titre: string, indice: string, actif: boolean): HTMLElement {
  const c = el(actif ? 'button' : 'div', actif ? 'card card-active' : 'card card-soon');
  if (c instanceof HTMLButtonElement) c.type = 'button';
  else c.setAttribute('aria-disabled', 'true');
  const pastille = el('span', 'card-icon');
  pastille.append(icône(icon, 28));
  c.append(pastille, el('span', 'card-title', titre), el('span', 'card-hint', indice));
  if (!actif) c.append(el('span', 'badge', fr.home.soon));
  return c;
}

export async function montrerAccueil(hôte: HTMLElement, bridge: Bridge, gestionnaires: GestionnairesAccueil): Promise<void> {
  const racine = el('main', 'home');
  const entête = el('header', 'home-header');
  entête.append(el('h1', 'home-title', fr.app), el('p', 'home-tagline', fr.home.tagline));

  const cartes = el('div', 'home-cards');
  const texte = carte(FileText, fr.home.text, fr.home.textHint, true);
  texte.addEventListener('click', () => gestionnaires.onNew());
  cartes.append(texte, carte(Sheet, fr.home.sheet, fr.home.sheetHint, false), carte(Presentation, fr.home.slides, fr.home.slidesHint, false));

  const ouvrir = el('button', 'btn home-open');
  ouvrir.type = 'button';
  ouvrir.append(icône(FolderOpen, 16), document.createTextNode(` ${fr.home.open}`));
  ouvrir.addEventListener('click', () => gestionnaires.onOpen());

  const récents = el('section', 'home-recent');
  récents.append(el('h2', 'home-subtitle', fr.home.recent));
  racine.append(entête, cartes, ouvrir, récents);
  hôte.replaceChildren(racine);

  const entrées = await bridge.listRecents().catch((): RecentEntry[] => []);
  if (!entrées.length) {
    récents.append(el('p', 'recent-empty', fr.home.noRecent));
    return;
  }
  const liste = el('ul', 'recent-list');
  for (const entrée of entrées) {
    const item = el('li');
    const b = el('button', 'recent-item');
    b.type = 'button';
    b.title = entrée.path;
    b.append(el('span', 'recent-name', entrée.name), el('span', 'recent-path', entrée.path));
    b.addEventListener('click', () => gestionnaires.onOpenRecent(entrée));
    item.append(b);
    liste.append(item);
  }
  récents.append(liste);
}
