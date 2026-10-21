// The five-second rule: data the user opens again is refetched only when it is older than the window.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRESH_MS, shouldRefetch } from '../../resources/js/shared/lib/freshness.ts';

test('a list fetched 4.999 s ago is not asked again', () => {
    assert.equal(shouldRefetch(false, 10_000, 14_999), false);
});

test('a list fetched 5 s ago is asked again', () => {
    assert.equal(shouldRefetch(false, 10_000, 15_000), true);
});

test('a list never fetched is always asked', () => {
    assert.equal(shouldRefetch(false, 0, 1), true);
});

test('a user-pressed reload ignores the window', () => {
    assert.equal(shouldRefetch(true, 10_000, 10_001), true);
});

test('the window is five seconds', () => {
    assert.equal(FRESH_MS, 5000);
});
