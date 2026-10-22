// The bell count pops only when a notification arrives, not on load or when items are read.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { badgeMotion, countRose } from '../../resources/js/shared/lib/count-rise.ts';

test('the first loaded count is not a rise', () => {
    assert.equal(countRose(null, 772), false);
});

test('a higher count is a rise', () => {
    assert.equal(countRose(772, 773), true);
});

test('reading notifications (a lower or equal count) is not a rise', () => {
    assert.equal(countRose(773, 770), false);
    assert.equal(countRose(770, 770), false);
});

test('a count that rose pops; a fresh count fades in', () => {
    assert.equal(badgeMotion(1), 'badge-pop');
    assert.equal(badgeMotion(0), 'motion-pop-in');
});
