// Tab refresh mark: a spinner while a background refetch runs, then a check that a timer later clears.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    barRefreshMark,
    isBackgroundFetch,
    keySourceState,
    nextRefreshMark,
    nextTabMark,
    REFRESH_DONE_MS,
    tabStamp,
} from '../../resources/js/shared/lib/refresh-mark.ts';

const src = (over: Partial<{ isFetching: boolean; isLoading: boolean; isPlaceholderData: boolean; dataUpdatedAt: number }>) => ({
    isFetching: false,
    isLoading: false,
    isPlaceholderData: false,
    dataUpdatedAt: 0,
    ...over,
});

test('a background fetch is one that refreshes data already on screen', () => {
    assert.equal(isBackgroundFetch(src({ isFetching: true, dataUpdatedAt: 1 })), true);
    assert.equal(isBackgroundFetch(src({ isFetching: true, isLoading: true })), false);
    assert.equal(isBackgroundFetch(src({ isFetching: true, isPlaceholderData: true })), false);
});

test('a tab stamp moves when any of its sources brings new data', () => {
    assert.equal(tabStamp([src({ dataUpdatedAt: 10 }), src({ dataUpdatedAt: 5 })]), 15);
});

test('switching tabs mid-fetch starts the new tab clean', () => {
    assert.deepEqual(nextTabMark({ tab: 'a', mark: 'busy', since: 10 }, 'b', false, 99), { tab: 'b', mark: 'idle', since: 99 });
});

test('a switch onto a tab that is already refetching shows its spinner', () => {
    assert.equal(nextTabMark({ tab: 'a', mark: 'idle', since: 10 }, 'b', true, 50).mark, 'busy');
});

test('the active tab shows the check only when its data moved', () => {
    assert.equal(nextTabMark({ tab: 'a', mark: 'busy', since: 10 }, 'a', false, 11).mark, 'done');
    assert.equal(nextTabMark({ tab: 'a', mark: 'busy', since: 10 }, 'a', false, 10).mark, 'idle');
});

test('the spinner remembers the stamp it started from', () => {
    assert.deepEqual(nextTabMark({ tab: 'a', mark: 'idle', since: 3 }, 'a', true, 10), { tab: 'a', mark: 'busy', since: 10 });
});

test('a refetch starting from rest shows the spinner', () => {
    assert.equal(nextRefreshMark('idle', true, false), 'busy');
});

test('a refetch that brought new data shows the check', () => {
    assert.equal(nextRefreshMark('busy', false, true), 'done');
});

test('a failed or abandoned refetch ends without the check', () => {
    assert.equal(nextRefreshMark('busy', false, false), 'idle');
});

test('the check stays until its timer clears it', () => {
    assert.equal(nextRefreshMark('done', false, false), 'done');
});

test('a new refetch during the check shows the spinner again', () => {
    assert.equal(nextRefreshMark('done', true, false), 'busy');
});

test('nothing happens at rest', () => {
    assert.equal(nextRefreshMark('idle', false, false), 'idle');
});

test('a tab bar announces updating while any tab updates, then updated', () => {
    assert.equal(barRefreshMark(['done', 'busy', undefined]), 'busy');
    assert.equal(barRefreshMark(['idle', 'done']), 'done');
    assert.equal(barRefreshMark([undefined, 'idle']), 'idle');
});

test('the check lasts one and a half seconds', () => {
    assert.equal(REFRESH_DONE_MS, 1500);
});

test('a refresh of loaded data counts as background, a first load does not', () => {
    assert.equal(keySourceState([{ fetchStatus: 'fetching', status: 'success', dataUpdatedAt: 5 }]).isFetching, true);
    assert.equal(keySourceState([{ fetchStatus: 'fetching', status: 'pending', dataUpdatedAt: 0 }]).isFetching, false);
});

test('the newest of the watched queries stamps the tab', () => {
    const states = [
        { fetchStatus: 'idle', status: 'success', dataUpdatedAt: 3 },
        { fetchStatus: 'idle', status: 'success', dataUpdatedAt: 9 },
    ];
    assert.equal(keySourceState(states).dataUpdatedAt, 9);
    assert.equal(keySourceState([]).dataUpdatedAt, 0);
});
