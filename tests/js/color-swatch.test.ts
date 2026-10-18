// Shared colour swatch picker helpers: hex normalising and palette lookup.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SWATCHES, findSwatch, normalizeHex } from '../../resources/js/shared/lib/color-swatch.ts';

test('the default palette has the five approved colours in order', () => {
    assert.deepEqual(
        DEFAULT_SWATCHES.map((s) => s.hex),
        ['#3b82f6', '#059669', '#ea580c', '#8b5cf6', '#ec4899'],
    );
    assert.deepEqual(
        DEFAULT_SWATCHES.map((s) => s.nameKey),
        ['color_blue', 'color_green', 'color_orange', 'color_violet', 'color_pink'],
    );
});

test('a hex is trimmed and lowercased', () => {
    assert.equal(normalizeHex(' #3B82F6 '), '#3b82f6');
});

test('anything but #rrggbb is not a colour', () => {
    for (const bad of ['', '3b82f6', '#fff', '#3b82f', '#3b82f6aa', '#zzzzzz', 'red']) {
        assert.equal(normalizeHex(bad), null, bad);
    }
});

test('a palette colour is found whatever its case', () => {
    assert.equal(findSwatch('#EA580C')?.nameKey, 'color_orange');
});

test('a colour outside the palette is not found', () => {
    assert.equal(findSwatch('#2563eb'), undefined);
    assert.equal(findSwatch('#64748b'), undefined);
    assert.equal(findSwatch(''), undefined);
});

test('a custom palette can be searched', () => {
    const palette = [{ hex: '#64748B', nameKey: 'x' }];
    assert.equal(findSwatch('#64748b', palette)?.nameKey, 'x');
});
