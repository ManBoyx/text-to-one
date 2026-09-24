import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const racine = fileURLToPath(new URL('.', import.meta.url));

// L'interface est un site statique que la fenêtre charge depuis le disque : chemins relatifs.
export default defineConfig({
  root: `${racine}src/renderer`,
  base: './',
  build: { outDir: `${racine}dist/renderer`, emptyOutDir: true, target: 'esnext' },
  preview: { port: 4173, strictPort: true },
});
