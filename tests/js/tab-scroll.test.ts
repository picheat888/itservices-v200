// Sideways tab bar scrolling: hidden ends, page size, and bringing the active tab into view.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revealTab, sideEdges, TAB_FADE, tabPage } from '../../resources/js/shared/lib/tab-scroll.ts';

test('a bar that fits hides nothing', () => {
    assert.deepEqual(sideEdges(0, 600, 600), { before: false, after: false });
});

test('at the start only the end hides tabs, in the middle both, at the end only the start', () => {
    assert.deepEqual(sideEdges(0, 400, 900), { before: false, after: true });
    assert.deepEqual(sideEdges(200, 400, 900), { before: true, after: true });
    assert.deepEqual(sideEdges(500, 400, 900), { before: true, after: false });
});

test('sub-pixel scroll positions count as the end', () => {
    assert.deepEqual(sideEdges(499.5, 400, 900), { before: true, after: false });
});

test('a page is the width less both fades, at least 120 px', () => {
    assert.equal(tabPage(560), 560 - TAB_FADE * 2);
    assert.equal(tabPage(200), 120);
});

test('a tab under the end fade scrolls just clear of it', () => {
    const box = { left: 0, right: 400 };
    assert.equal(revealTab({ left: 330, right: 390 }, box, { before: false, after: true }), 390 - (400 - TAB_FADE));
});

test('a tab under the start fade scrolls back just clear of it', () => {
    const box = { left: 0, right: 400 };
    assert.equal(revealTab({ left: 20, right: 90 }, box, { before: true, after: true }), 20 - TAB_FADE);
});

test('a tab already in the clear stays put, and an end with nothing hidden has no fade to clear', () => {
    const box = { left: 0, right: 400 };
    assert.equal(revealTab({ left: 100, right: 200 }, box, { before: true, after: true }), 0);
    assert.equal(revealTab({ left: 0, right: 80 }, box, { before: false, after: true }), 0);
    assert.equal(revealTab({ left: 330, right: 400 }, box, { before: true, after: false }), 0);
});
