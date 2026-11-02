// Release and build time: one build stamp for the bundle and the server, shown on the login page and in Settings → System.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { auth as en } from '../../resources/js/lang/en/auth.ts';
import { auth as th } from '../../resources/js/lang/th/auth.ts';
import { APP_BUILT_AT } from '../../resources/js/shared/lib/app-build.ts';

const root = join(import.meta.dirname, '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('one build stamp goes into the bundle and into build-info.json, only for a real build', () => {
    const config = read('vite.config.js');
    assert.match(config, /const builtAt = command === 'build' \? localMinute\(new Date\(\)\) : null;/);
    assert.match(config, /__APP_BUILT_AT__: JSON\.stringify\(builtAt\)/);
    assert.match(config, /fileName: 'build-info\.json', source: JSON\.stringify\(\{ built_at: builtAt \}\)/);
    assert.match(config, /apply: 'build'/);
});

test('the build stamp is null outside a built bundle', () => {
    assert.equal(APP_BUILT_AT, null);
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
