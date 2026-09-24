import { defineConfig } from '@playwright/test';

// Tests de l'interface dans un navigateur, avec un faux pont à la place du processus principal.
export default defineConfig({
  testDir: 'tests/ui',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1440, height: 900 }, locale: 'fr-FR' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: false },
});
