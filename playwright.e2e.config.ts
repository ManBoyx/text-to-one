import { defineConfig } from '@playwright/test';

// Tests de la vraie application Electron : une seule à la fois, car chaque test lance sa propre fenêtre.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
});
