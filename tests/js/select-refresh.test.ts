// Dropdown refresh: the highlight follows its item when the list reloads, and a chosen value that left the list is spotted.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRemovedValue, keepActiveIndex, menuBody, nextActiveIndex, tabLeavesMenu } from '../../resources/js/shared/lib/select-refresh.ts';

test('an async picker keeps the index of the row the user is on when results change', () => {
    assert.equal(nextActiveIndex(false, [{ value: 'somchai' }], [{ value: 'somboon' }, { value: 'somchai' }], 0), 0);
});

test('a reloading list moves the highlight with its item', () => {
    assert.equal(nextActiveIndex(true, [{ value: 'somchai' }], [{ value: 'somboon' }, { value: 'somchai' }], 0), 1);
});

test('a list that never loaded shows the skeleton while it loads, not No match', () => {
    assert.equal(menuBody({ count: 0, query: '', reloading: true, loaded: false, failed: false, asyncLoading: false }), 'skeleton');
});

test('a list whose first load failed shows the empty state with its reload button', () => {
    assert.equal(menuBody({ count: 0, query: '', reloading: true, loaded: false, failed: true, asyncLoading: false }), 'empty');
});

test('Tab leaves the menu only from its last control, Shift+Tab only from the search box', () => {
    assert.equal(tabLeavesMenu(0, 1, false), true);
    assert.equal(tabLeavesMenu(0, 1, true), true);
    assert.equal(tabLeavesMenu(0, 2, false), false);
    assert.equal(tabLeavesMenu(1, 2, false), true);
    assert.equal(tabLeavesMenu(1, 2, true), false);
});

test('a loaded list with no match shows the empty state', () => {
    assert.equal(menuBody({ count: 0, query: 'eng', reloading: true, loaded: true, failed: false, asyncLoading: false }), 'empty');
    assert.equal(menuBody({ count: 0, query: '', reloading: true, loaded: true, failed: false, asyncLoading: false }), 'empty');
});

test('a plain dropdown keeps its dash when empty and unsearched', () => {
    assert.equal(menuBody({ count: 0, query: '', reloading: false, loaded: true, failed: false, asyncLoading: false }), 'dash');
    assert.equal(menuBody({ count: 0, query: 'x', reloading: false, loaded: true, failed: false, asyncLoading: false }), 'empty');
});

test('an async search in flight shows the skeleton', () => {
    assert.equal(menuBody({ count: 0, query: 'so', reloading: false, loaded: true, failed: false, asyncLoading: true }), 'skeleton');
});

test('rows show whenever there are any', () => {
    assert.equal(menuBody({ count: 3, query: '', reloading: true, loaded: false, failed: false, asyncLoading: false }), 'list');
});

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
