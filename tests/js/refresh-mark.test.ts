// Tab refresh mark: a spinner while a background refetch runs, then a check that a timer later clears.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextRefreshMark, REFRESH_DONE_MS } from '../../resources/js/shared/lib/refresh-mark.ts';

test('a refetch starting from rest shows the spinner', () => {
    assert.equal(nextRefreshMark('idle', true), 'busy');
});

test('a refetch ending shows the check', () => {
    assert.equal(nextRefreshMark('busy', false), 'done');
});

test('the check stays until its timer clears it', () => {
    assert.equal(nextRefreshMark('done', false), 'done');
});

test('a new refetch during the check shows the spinner again', () => {
    assert.equal(nextRefreshMark('done', true), 'busy');
});

test('nothing happens at rest', () => {
    assert.equal(nextRefreshMark('idle', false), 'idle');
});

test('the check lasts one and a half seconds', () => {
    assert.equal(REFRESH_DONE_MS, 1500);
});
