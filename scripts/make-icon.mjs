import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// Transforme build/icon.svg en build/icon.png (1024 × 1024, fond transparent) pour les installateurs.
const svg = readFileSync('build/icon.svg', 'utf8');
const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:1024px;height:1024px}</style>${svg}`);
await page.screenshot({ path: 'build/icon.png', omitBackground: true });
await navigateur.close();
