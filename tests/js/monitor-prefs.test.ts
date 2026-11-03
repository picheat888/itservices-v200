// Monitor TV settings kept by the TV itself: anything stored that is missing or unknown falls back to the defaults.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MONITOR_DEFAULTS, normalizePrefs } from '../../resources/js/modules/monitor/lib/monitor-prefs.ts';

test('a new TV starts in Thai, dark, with sound on', () => {
    assert.deepEqual(MONITOR_DEFAULTS, { lang: 'th', theme: 'dark', sound: true });
    assert.deepEqual(normalizePrefs(undefined), MONITOR_DEFAULTS);
});

test('stored choices are kept', () => {
    assert.deepEqual(normalizePrefs({ lang: 'en', theme: 'light', sound: false }), { lang: 'en', theme: 'light', sound: false });
});

test('unknown or broken values fall back one by one', () => {
    assert.deepEqual(normalizePrefs({ lang: 'jp', theme: 'light', sound: 'yes' }), { lang: 'th', theme: 'light', sound: true });
    assert.deepEqual(normalizePrefs('garbage'), MONITOR_DEFAULTS);
});
