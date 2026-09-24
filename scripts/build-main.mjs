import { build } from 'esbuild';

// Le processus principal et le pont préchargé sont assemblés chacun en un seul fichier.
const commun = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], logLevel: 'info' };

await build({ ...commun, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs' });
await build({ ...commun, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs' });
