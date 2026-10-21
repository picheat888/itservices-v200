// Dropdown refresh: the highlight follows its item when the list reloads, and a chosen value that left the list is spotted.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRemovedValue, keepActiveIndex } from '../../resources/js/shared/lib/select-refresh.ts';

const list = (...values: string[]) => values.map((value) => ({ value }));

test('the highlight follows its value when a new item sorts above it', () => {
    assert.equal(keepActiveIndex(list('hr', 'prod', 'qc'), list('eng', 'hr', 'prod', 'qc'), 1), 2);
});

test('a highlighted item that disappears clamps to the end', () => {
    assert.equal(keepActiveIndex(list('a', 'b', 'c'), list('a'), 2), 0);
});

test('an empty refreshed list gives index 0', () => {
    assert.equal(keepActiveIndex(list('a', 'b'), [], 1), 0);
});

test('a chosen value missing from a loaded list is removed', () => {
    assert.equal(isRemovedValue('7', list('1'), true), true);
});

test('nothing is removed before the list ever loaded', () => {
    assert.equal(isRemovedValue('7', [], false), false);
});

test('an empty value is never removed', () => {
    assert.equal(isRemovedValue('', [], true), false);
});
