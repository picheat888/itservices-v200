// The bell count pops only when a notification arrives, not on load or when items are read.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countRose } from '../../resources/js/app/layout/count-rise.ts';

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
