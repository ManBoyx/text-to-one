import './styles/base.css';
import './styles/sheet.css';
import './styles/toolbar.css';
import './styles/find.css';
import './styles/dialog.css';
import './styles/home.css';
import { Shell } from './shell';
import { applyStoredTheme } from './ui/theme';

applyStoredTheme();
const hôte = document.getElementById('app');
if (!hôte) throw new Error("L'élément #app est introuvable.");
void new Shell(hôte, window.tto).start();
