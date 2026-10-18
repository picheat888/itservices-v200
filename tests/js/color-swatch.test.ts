// Shared colour swatch picker helpers: hex normalising, palette lookup, contrast and the custom grid.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    CARD_GROUNDS,
    contrastProblem,
    CUSTOM_COLOR_GRID,
    DEFAULT_SWATCHES,
    findSwatch,
    hexContrastRatio,
    meetsCardContrast,
    normalizeHex,
} from '../../resources/js/shared/lib/color-swatch.ts';

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

test('a hex typed without the leading # gets one', () => {
    assert.equal(normalizeHex('3B82F6'), '#3b82f6');
});

test('anything but rrggbb is not a colour', () => {
    for (const bad of ['', '#', '#fff', '#3b82f', '#3b82f6aa', '##3b82f6', '#zzzzzz', 'red']) {
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

test('contrast ratio follows WCAG', () => {
    assert.equal(hexContrastRatio('#000000', '#ffffff'), 21);
    assert.equal(hexContrastRatio('#ffffff', '#ffffff'), 1);
    assert.equal(hexContrastRatio('#ffffff', '#000000'), 21);
    assert.equal(hexContrastRatio('#767676', '#ffffff').toFixed(2), '4.54');
});

test('the card grounds are the light and dark --card colours', () => {
    assert.deepEqual(CARD_GROUNDS, ['#ffffff', '#131720']);
});

test('every default swatch reaches 3:1 on both cards', () => {
    for (const s of DEFAULT_SWATCHES) {
        assert.ok(meetsCardContrast(s.hex), s.hex);
    }
});

test('a pale or a very dark colour fails the card check', () => {
    assert.equal(meetsCardContrast('#fbbf24'), false);
    assert.equal(meetsCardContrast('#334155'), false);
});

test('every custom grid colour reaches 3:1 on both cards', () => {
    for (const hex of CUSTOM_COLOR_GRID.flat()) {
        for (const ground of CARD_GROUNDS) {
            assert.ok(hexContrastRatio(hex, ground) >= 3, `${hex} on ${ground}`);
        }
    }
});

test('the custom grid is 3 full rows of 12 lowercase unique hexes', () => {
    assert.equal(CUSTOM_COLOR_GRID.length, 3);
    for (const row of CUSTOM_COLOR_GRID) assert.equal(row.length, 12);
    const hexes = CUSTOM_COLOR_GRID.flat();
    assert.equal(new Set(hexes).size, hexes.length);
    for (const hex of hexes) assert.equal(normalizeHex(hex), hex);
});

test('a colour that reads on both cards has no problem', () => {
    assert.equal(contrastProblem('#0c9d8c'), null);
    for (const s of DEFAULT_SWATCHES) assert.equal(contrastProblem(s.hex), null, s.hex);
});

test('a pale colour is too light for the light card', () => {
    assert.equal(contrastProblem('#fcd34d'), 'too_light');
    assert.equal(contrastProblem('#ffffff'), 'too_light');
});

test('a very dark colour is too dark for the dark card', () => {
    assert.equal(contrastProblem('#334155'), 'too_dark');
    assert.equal(contrastProblem('#000000'), 'too_dark');
});
