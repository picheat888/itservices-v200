// A dialog keeps showing what it showed while open, so its header does not empty during the exit animation.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHold } from '../../resources/js/shared/lib/held-while-open.ts';

test('while open the hold passes the current value through', () => {
    const hold = createHold<number[]>([]);
    assert.deepEqual(hold([1, 2], true), [1, 2]);
    assert.deepEqual(hold([1, 2, 3], true), [1, 2, 3]);
});

test('closing keeps the last value seen while open, even when the selection is cleared', () => {
    const hold = createHold<number[]>([]);
    hold([4, 5], true);
    assert.deepEqual(hold([], false), [4, 5]);
    assert.deepEqual(hold([], false), [4, 5]);
});

test('opening again shows the new value', () => {
    const hold = createHold<number[]>([]);
    hold([4, 5], true);
    hold([], false);
    assert.deepEqual(hold([9], true), [9]);
});

test('a dialog that was never opened shows its starting value', () => {
    const hold = createHold<number[]>([7]);
    assert.deepEqual(hold([], false), [7]);
});
