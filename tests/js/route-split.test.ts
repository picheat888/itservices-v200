// UI-2: every page loads as its own file, the sidebar can preload it, and a missing file after a deploy reloads once.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { isPageLoadWaiting, reloadForNewBuild, trackPageLoad } from '../../resources/js/shared/lib/chunk-reload.ts';

const root = join(import.meta.dirname, '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const modules = readdirSync(join(root, 'resources/js/modules'));

test('no module barrel exports a page statically, except the login page', () => {
    for (const m of modules) {
        let barrel: string;
        try {
            barrel = read(`resources/js/modules/${m}/index.ts`);
        } catch {
            continue;
        }
        for (const [, name] of barrel.matchAll(/export \{[^}]*\bdefault as (\w+Page)\b[^}]*\} from '\.\/pages/g)) {
            assert.equal(name, 'LoginPage', `${m} exports ${name} statically`);
        }
    }
    assert.match(read('resources/js/modules/settings/index.ts'), /export const SettingsPage = lazyPage\(\(\) => import\('\.\/pages'\)\);/);
});

test('report pages load one file each', () => {
    const routes = read('resources/js/modules/report/routes.tsx');
    assert.doesNotMatch(routes, /^import \w+ from '\.\/pages\//m);
    assert.equal(routes.match(/= lazyPage\(\(\) => import\('\.\/pages\/[a-z-]+'\)\);/g)?.length, 22);
});

test('the shell and the standalone pages wait for page code inside Suspense', () => {
    assert.match(read('resources/js/app/layout/app-shell.tsx'), /<Suspense fallback=\{<PageLoading \/>\}>\s*<Outlet \/>\s*<\/Suspense>/);
    assert.match(read('resources/js/app/App.tsx'), /<Suspense[\s\S]*?<PageLoading \/>[\s\S]*?<Routes>[\s\S]*<\/Routes>\s*<\/Suspense>/);
});

test('every menu entry has a page the sidebar can preload', () => {
    const nav = read('resources/js/app/nav.ts');
    const pages = read('resources/js/app/route-pages.ts');
    const paths = [...nav.matchAll(/to: '([^']+)'/g)].map((m) => m[1]);
    assert.ok(paths.length >= 13);
    for (const path of paths) assert.match(pages, new RegExp(`'${path}': \\w+Page,`), `${path} has no preload`);
    assert.match(read('resources/js/app/layout/sidebar.tsx'), /onPointerEnter=\{\(\) => preloadNavPage\(item\.to\)\}/);
});

test('the loading fallback waits 300ms before it shows', () => {
    const loading = read('resources/js/shared/components/page-loading.tsx');
    assert.match(loading, /PAGE_LOADING_DELAY_MS = 300;/);
    assert.match(loading, /if \(!shown\) return null;/);
});

test('report hub cards preload their report page', () => {
    assert.match(read('resources/js/modules/report/routes.tsx'), /export function preloadReportPage\(path: string\)/);
    assert.match(
        read('resources/js/modules/report/components/report-catalogue.tsx'),
        /onPointerEnter=\{\(\) => preloadReportPage\(reportSlug\(report\.key\)\)\}/,
    );
});

test('the one build-file handler reloads only while a page is being opened', () => {
    const handler = read('resources/js/shared/lib/client-error-report.ts');
    assert.match(handler, /if \(isPageLoadWaiting\(\) && reloadForNewBuild\(\)\) event\.preventDefault\(\);/);
    assert.doesNotMatch(handler, /function reloadForNewBuild/);
});

test('a page load counts as waiting until it settles; a preload alone never does', async () => {
    let finish!: () => void;
    const load = trackPageLoad(new Promise<void>((resolve) => (finish = resolve)));
    assert.equal(isPageLoadWaiting(), true);
    finish();
    await load;
    assert.equal(isPageLoadWaiting(), false);

    const failed = trackPageLoad(Promise.reject(new Error('gone')));
    await assert.rejects(failed);
    assert.equal(isPageLoadWaiting(), false);
});

test('reload is skipped when offline, and at most once a minute', (t) => {
    const store = new Map<string, string>();
    let reloads = 0;
    const win = {
        sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
        location: { reload: () => void reloads++ },
    };
    const online = { onLine: true };
    const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
    Object.defineProperty(globalThis, 'navigator', { value: online, configurable: true });
    t.after(() => {
        delete (globalThis as { window?: unknown }).window;
        if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
    });

    assert.equal(reloadForNewBuild(1_000_000), true);
    assert.equal(reloadForNewBuild(1_030_000), false);
    assert.equal(reloadForNewBuild(1_061_000), true);
    online.onLine = false;
    assert.equal(reloadForNewBuild(1_200_000), false);
    assert.equal(reloads, 2);
});

test('a page already downloaded renders straight, without a Suspense round trip', () => {
    const lazyPage = read('resources/js/shared/lib/lazy-page.ts');
    assert.match(lazyPage, /if \(module\) loaded = module\.default;/);
    assert.match(lazyPage, /useState<ComponentType>\(\(\) => loaded \?\? current\)/);
});
