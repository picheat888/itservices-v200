// Second Vite build: the service worker (resources/js/sw/sw.ts) as one script, public/build/sw.js.
// Writes beside the SPA build without emptying it; `npm run build` runs it after the SPA build.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, transformWithEsbuild } from 'vite';
import { isBellKey } from './resources/js/sw/bell-keys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LANG_FILE = /[\\/]resources[\\/]js[\\/]lang[\\/](en|th)[\\/]\w+\.ts$/;

// Drops every other key from the lang files, so sw.js does not carry every screen's text
const bellKeysOnly = {
    name: 'bell-keys-only',
    async transform(code, id) {
        if (!LANG_FILE.test(id)) {
            return null;
        }
        const cjs = (await transformWithEsbuild(code, id, { loader: 'ts', format: 'cjs' })).code;
        const module = { exports: {} };
        new Function('module', 'exports', cjs)(module, module.exports);
        const entries = Object.entries(module.exports);
        if (entries.length !== 1) {
            throw new Error(`bell-keys-only: expected one exported dictionary in ${id}`);
        }
        const [name, dict] = entries[0];
        const kept = Object.fromEntries(Object.entries(dict).filter(([key]) => isBellKey(key)));

        return { code: `export const ${name} = ${JSON.stringify(kept)};`, map: null };
    },
};

// In watch mode, rebuild whenever the SPA build rewrites public/build (its empty-out step deletes sw.js)
const followSpaBuild = {
    name: 'follow-spa-build',
    buildStart() {
        if (this.meta.watchMode) {
            this.addWatchFile(resolve(__dirname, 'public/build/manifest.json'));
        }
    },
};

export default defineConfig({
    publicDir: false,
    plugins: [bellKeysOnly, followSpaBuild],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'resources/js'),
        },
    },
    build: {
        outDir: 'public/build',
        emptyOutDir: false,
        copyPublicDir: false,
        lib: {
            entry: resolve(__dirname, 'resources/js/sw/sw.ts'),
            formats: ['iife'],
            name: 'itsdServiceWorker',
            fileName: () => 'sw.js',
        },
    },
});
