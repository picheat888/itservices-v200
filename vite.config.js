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

// One build time, baked into the bundle and written to public/build/build-info.json for the server
function buildInfo(builtAt) {
    return {
        name: 'build-info',
        apply: 'build',
        generateBundle() {
            this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ built_at: builtAt }) });
        },
    };
}

export default defineConfig(({ command }) => {
    const builtAt = command === 'build' ? localMinute(new Date()) : null;

    return {
        plugins: [
            laravel({
                input: ['resources/css/app.css', 'resources/js/app/App.tsx'],
                refresh: true,
            }),
            react(),
            tailwindcss(),
            buildInfo(builtAt),
        ],
        define: {
            __APP_BUILT_AT__: JSON.stringify(builtAt),
        },
        resolve: {
            alias: {
                '@': resolve(__dirname, 'resources/js'),
            },
        },
        esbuild: {
            jsx: 'automatic',
        },
    };
});
