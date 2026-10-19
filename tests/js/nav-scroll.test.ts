// Sidebar menu scrolling: hidden ends and keeping the open page's item clear of the fades.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FADE_ABOVE, FADE_BELOW, revealOffset, scrollEdges } from '../../resources/js/app/layout/nav-scroll.ts';

test('a menu that fits hides nothing at either end', () => {
    assert.deepEqual(scrollEdges(0, 500, 500), { above: false, below: false });
});

test('a long menu at the top hides items below only', () => {
    assert.deepEqual(scrollEdges(0, 470, 560), { above: false, below: true });
});

test('scrolled to the end hides items above only, allowing a sub-pixel gap', () => {
    assert.deepEqual(scrollEdges(90, 470, 560), { above: true, below: false });
    assert.deepEqual(scrollEdges(89.5, 470, 560), { above: true, below: false });
});

test('an item under the bottom fade scrolls up until it clears it', () => {
    const box = { top: 64, bottom: 535 };
    assert.equal(revealOffset({ top: 560, bottom: 594 }, box), 594 - (535 - FADE_BELOW));
    assert.equal(revealOffset({ top: 470, bottom: 504 }, box), 504 - (535 - FADE_BELOW));
});

test('an item under the top fade scrolls down until it clears it', () => {
    assert.equal(revealOffset({ top: 50, bottom: 84 }, { top: 64, bottom: 535 }), 50 - (64 + FADE_ABOVE));
});

test('an item already clear of both fades stays put', () => {
    assert.equal(revealOffset({ top: 200, bottom: 234 }, { top: 64, bottom: 535 }), 0);
});
