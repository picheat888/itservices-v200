import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** "YYYY-MM-DD HH:mm" in this machine's local time. */
function localMinute(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Each build (watch rebuilds too) stamps one time: virtual:app-build for the bundle, public/build/build-info.json for the server
function buildStamp() {
    const VIRTUAL_ID = 'virtual:app-build';
    let isBuild = false;
    let builtAt = null;

    return {
        name: 'build-stamp',
        configResolved(config) {
            isBuild = config.command === 'build';
        },
        buildStart() {
            builtAt = isBuild ? localMinute(new Date()) : null;
        },
        resolveId(id) {
            return id === VIRTUAL_ID ? `\0${VIRTUAL_ID}` : null;
        },
        load(id) {
            return id === `\0${VIRTUAL_ID}` ? `export const APP_BUILT_AT = ${JSON.stringify(builtAt)};` : null;
        },
        generateBundle() {
            if (isBuild) {
                this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ built_at: builtAt }) });
            }
        },
    };
}

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app/App.tsx'],
            refresh: true,
        }),
        react(),
        tailwindcss(),
        buildStamp(),
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'resources/js'),
        },
    },
    esbuild: {
        jsx: 'automatic',
    },
});
