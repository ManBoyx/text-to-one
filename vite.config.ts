import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const racine = fileURLToPath(new URL('.', import.meta.url));

// L'interface est un site statique que la fenêtre charge depuis le disque : chemins relatifs.
export default defineConfig({
  root: `${racine}src/renderer`,
  base: './',
  // Pas d'inclusion en base64 : la politique de sécurité de la page n'autorise les polices que depuis les fichiers (KaTeX en apporte).
  build: { outDir: `${racine}dist/renderer`, emptyOutDir: true, target: 'esnext', assetsInlineLimit: 0 },
  preview: { port: 4173, strictPort: true },
});
