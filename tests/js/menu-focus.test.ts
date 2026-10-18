// Tab cycling inside the narrow-screen sidebar menu.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextFocusIndex } from '../../resources/js/app/layout/menu-focus.ts';

test('Tab moves forward and wraps from the last stop to the first', () => {
    assert.equal(nextFocusIndex(4, 0, false), 1);
    assert.equal(nextFocusIndex(4, 3, false), 0);
});

test('Shift+Tab moves back and wraps from the first stop to the last', () => {
    assert.equal(nextFocusIndex(4, 2, true), 1);
    assert.equal(nextFocusIndex(4, 0, true), 3);
});

test('focus outside the menu lands on the first stop', () => {
    assert.equal(nextFocusIndex(4, -1, false), 0);
    assert.equal(nextFocusIndex(4, -1, true), 0);
});

test('no stops means nowhere to go', () => {
    assert.equal(nextFocusIndex(0, -1, false), -1);
});
