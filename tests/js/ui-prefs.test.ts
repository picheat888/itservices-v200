// The UI settings this browser saved are checked before use: unknown or broken values keep the default.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreUiPrefs, type SavedUiPrefs } from '../../resources/js/shared/lib/ui-prefs.ts';

const DEFAULTS: SavedUiPrefs = {
    dark: false,
    lang: 'en',
    density: 'normal',
    radius: 10,
    sidebar: 'labeled',
    accent: '#2563eb',
    assetStatusColors: { deployed: '#0284c7', ready: '#059669' },
    dateConfig: { format: 'dmy_slash', era: 'ce', time: '24' },
};

test('a good saved copy is kept as it is', () => {
    const saved = { dark: true, lang: 'th', density: 'cozy', radius: 0, sidebar: 'icons', accent: '#AABBCC' };
    const restored = restoreUiPrefs(saved, DEFAULTS);
    assert.deepEqual(
        [restored.dark, restored.lang, restored.density, restored.radius, restored.sidebar, restored.accent],
        [true, 'th', 'cozy', 0, 'icons', '#AABBCC'],
    );
});

test('values an older or broken build left behind fall back to the defaults', () => {
    const saved = { dark: 'yes', lang: 'jp', density: 'comfortable', radius: 99, sidebar: 'wide', accent: 'red' };
    const restored = restoreUiPrefs(saved, DEFAULTS);
    assert.deepEqual(
        [restored.dark, restored.lang, restored.density, restored.radius, restored.sidebar, restored.accent],
        [false, 'en', 'normal', 10, 'labeled', '#2563eb'],
    );
    assert.equal(restoreUiPrefs({ radius: 4.5 }, DEFAULTS).radius, 10);
});

test('asset colours keep every default key and take only real hex colours', () => {
    const restored = restoreUiPrefs({ assetStatusColors: { deployed: '#111111', ready: 'green', writeoff: '#dc2626' } }, DEFAULTS);
    assert.deepEqual(restored.assetStatusColors, { deployed: '#111111', ready: '#059669', writeoff: '#dc2626' });
});

test('nothing saved, or not an object, gives the defaults with a normalised date setting', () => {
    for (const saved of [undefined, null, 'text', 42]) {
        const restored = restoreUiPrefs(saved, DEFAULTS);
        assert.equal(restored.lang, 'en');
        assert.deepEqual(restored.assetStatusColors, DEFAULTS.assetStatusColors);
        assert.ok(restored.dateConfig.format);
    }
});
