/// <reference types="vite/client" />

/** "YYYY-MM-DD HH:mm" when `npm run build` ran (vite.config.js); null under the dev server. */
declare module 'virtual:app-build' {
    export const APP_BUILT_AT: string | null;
}
