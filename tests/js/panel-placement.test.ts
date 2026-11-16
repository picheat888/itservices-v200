// UAT RPT-24-02: a filter or column panel on a page opens above its trigger when it does not fit below.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pagePanelSpot } from '../../resources/js/shared/lib/panel-placement.ts';

test('the RPT-24-02 column panel near the bottom of a 900px screen opens above its trigger', () => {
    // "คอลัมน์" of the licence holders card after scrolling to the end; the panel is 351px tall
    const spot = pagePanelSpot({ top: 560, bottom: 592 }, 900, 351);
    assert.deepEqual(spot, { bottom: 344, maxHeight: 548 });
});

test('a panel that fits below opens below, as before', () => {
    assert.deepEqual(pagePanelSpot({ top: 100, bottom: 132 }, 900, 351), { top: 136, maxHeight: 756 });
});

test('before the panel is drawn its height is unknown, so it starts below', () => {
    assert.deepEqual(pagePanelSpot({ top: 560, bottom: 592 }, 900, null), { top: 596, maxHeight: 296 });
});

test('a panel that does not fit below stays below when above is not roomier, and scrolls in its room', () => {
    assert.deepEqual(pagePanelSpot({ top: 200, bottom: 232 }, 500, 400), { top: 236, maxHeight: 256 });
});

test('a panel taller than both sides takes the roomier side and scrolls there', () => {
    assert.deepEqual(pagePanelSpot({ top: 400, bottom: 432 }, 700, 900), { bottom: 304, maxHeight: 388 });
});

test('FilterPopover uses the page rule outside a dialog and keeps the dialog rule', () => {
    const popover = readFileSync(join(import.meta.dirname, '../../resources/js/shared/components/filter-popover.tsx'), 'utf8');
    assert.match(
        popover,
        /if \(!dialog\) \{\s*const panel = panelRef\.current;\s*setPos\(\{ left, \.\.\.pagePanelSpot\(r, window\.innerHeight, panel \? naturalHeight\(panel\) : null, 4, EDGE\) \}\);/,
    );
    // Placed again once drawn, so the page rule knows the panel's height before the first paint
    assert.match(popover, /useLayoutEffect\(\(\) => \{\s*if \(open\) place\(\);/);
    // A capped page panel scrolls its body like a dialog panel does
    assert.match(popover, /'flex flex-col',\s*host \? 'absolute z-50' : 'fixed z-\[9999\]'/);
    assert.match(popover, /const up = below < MIN_PANEL && above > below;/);
});
