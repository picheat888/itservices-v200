// Tab refresh mark: a spinner while a background refetch runs, then a check that a timer later clears.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barRefreshMark, nextRefreshMark, REFRESH_DONE_MS } from '../../resources/js/shared/lib/refresh-mark.ts';

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
