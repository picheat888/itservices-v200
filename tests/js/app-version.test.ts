// Release and build time: one build stamp for the bundle and the server, shown on the login page and in Settings → System.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { auth as en } from '../../resources/js/lang/en/auth.ts';
import { auth as th } from '../../resources/js/lang/th/auth.ts';
import viteConfig from '../../vite.config.js';

const root = join(import.meta.dirname, '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

type Hook = (...args: unknown[]) => unknown;
const stamp = (viteConfig as { plugins: unknown[] }).plugins.flat(3).find((p) => (p as { name?: string })?.name === 'build-stamp') as Record<
    string,
    Hook
>;

function runBuild(command: 'build' | 'serve') {
    const emitted: { fileName: string; source: string }[] = [];
    stamp.configResolved({ command });
    stamp.buildStart();
    const id = stamp.resolveId('virtual:app-build') as string;
    const code = stamp.load(id) as string;
    stamp.generateBundle.call({ emitFile: (file: { fileName: string; source: string }) => emitted.push(file) });
    return { code, emitted };
}

test('a build stamps one time into the bundle and into build-info.json', () => {
    const { code, emitted } = runBuild('build');
    const builtAt = code.match(/^export const APP_BUILT_AT = "(\d{4}-\d{2}-\d{2} \d{2}:\d{2})";$/)?.[1];
    assert.ok(builtAt, code);
    assert.deepEqual(emitted, [{ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ built_at: builtAt }) }]);
});

test('the dev server has no build stamp and writes no build-info.json', () => {
    const { code, emitted } = runBuild('serve');
    assert.equal(code, 'export const APP_BUILT_AT = null;');
    assert.deepEqual(emitted, []);
});

test('every rebuild of a watch build takes a new stamp', () => {
    assert.match(read('vite.config.js'), /buildStart\(\) \{\s*builtAt = isBuild \? localMinute\(new Date\(\)\) : null;/);
    assert.equal(stamp.resolveId('somewhere-else'), null);
});

test('a browser error report carries the build it came from', () => {
    assert.match(read('resources/js/shared/lib/client-error-report.ts'), /request_id: lastRequestId,\s*build: APP_BUILT_AT,/);
});

test('both login footers show the release beside the copyright line', () => {
    assert.match(read('resources/js/modules/auth/pages/login.tsx'), /\{brandName\}\s*<\/span>\s*<AppVersionLine \/>/);
    assert.match(
        read('resources/js/modules/auth/components/login-brand-panel.tsx'),
        /\{brandName\}\s*<\/span>\s*<AppVersionLine className="opacity-85" \/>/,
    );
});

test('the version line uses the date format setting and English words in both languages', () => {
    const line = read('resources/js/modules/auth/components/app-version-line.tsx');
    assert.match(line, /formatDate\.dateTime\(APP_BUILT_AT\)/);
    for (const dict of [en, th]) {
        assert.equal(dict.login_version_build, 'Version {version} Build {build}');
        assert.equal(dict.login_version, 'Version {version}');
    }
});

test('Settings → System ends with the read-only about section after the save row', () => {
    assert.match(
        read('resources/js/modules/settings/pages/index.tsx'),
        /<SaveRow [^>]*\/>\s*<\/div>\s*<div className="border-border mt-8 border-t pt-8">\s*<AboutSystemSection \/>/,
    );
    assert.match(read('resources/js/modules/settings/components/about-system-section.tsx'), /queryFn: settingsApi\.getSystemInfo/);
});
