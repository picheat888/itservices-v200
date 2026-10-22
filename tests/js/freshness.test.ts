// The five-second rule: data the user opens again is refetched only when it is older than the window.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRESH_LIST, FRESH_MS, FRESH_VIEW, justOpened, shouldRefetch, shouldRequest } from '../../resources/js/shared/lib/freshness.ts';

test('on-screen data waits five seconds and refetches on browser-tab return', () => {
    assert.deepEqual(FRESH_VIEW, { staleTime: 5000, refetchOnWindowFocus: true });
});

test('a dropdown source waits five seconds and only refetches when its dropdown opens', () => {
    assert.deepEqual(FRESH_LIST, { staleTime: 5000 });
});

test('a dialog counts as opened only on the closed-to-open step', () => {
    assert.equal(justOpened(false, true), true);
    assert.equal(justOpened(true, true), false);
    assert.equal(justOpened(true, false), false);
});

test('a reopen while the first reload is still running sends nothing more', () => {
    assert.equal(shouldRequest(false, true, 10_000, 30_000), false);
    assert.equal(shouldRequest(true, true, 10_000, 10_001), false);
});

test('when nothing is running the five-second rule decides', () => {
    assert.equal(shouldRequest(false, false, 10_000, 14_999), false);
    assert.equal(shouldRequest(false, false, 10_000, 15_000), true);
    assert.equal(shouldRequest(true, false, 10_000, 10_001), true);
});

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
