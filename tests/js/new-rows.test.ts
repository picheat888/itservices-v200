// Newly created rows: who sees them, how long they stay pinned, and their order on top of a list.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    addEntries,
    dropEntry,
    dropOnMissing,
    liveIds,
    NEW_ROW_MS,
    type NewRowEntry,
    nextExpiry,
    pinOrder,
    pruneExpired,
    restoreEntries,
    splitPinned,
    forUser,
} from '../../resources/js/shared/lib/new-rows.ts';

const U = 7;

test('a pin lasts one minute', () => {
    assert.equal(NEW_ROW_MS, 60_000);
});

test('the newest save sits first and ids from one save keep their order', () => {
    let e = addEntries([], U, 'items', [1, 2], 0);
    e = addEntries(e, U, 'items', [3], 10_000);
    assert.deepEqual(liveIds(e, U, 'items', 10_000), [3, 1, 2]);
});

test('saving an id again moves it first without duplicating it', () => {
    let e = addEntries([], U, 'items', [1, 2], 0);
    e = addEntries(e, U, 'items', [3], 10_000);
    e = addEntries(e, U, 'items', [1], 30_000);
    assert.deepEqual(liveIds(e, U, 'items', 30_000), [1, 3, 2]);
    assert.equal(e.length, 3);
});

test('a pin is live until exactly one minute has passed', () => {
    const e = addEntries([], U, 'items', [1], 0);
    assert.deepEqual(liveIds(e, U, 'items', 59_999), [1]);
    assert.deepEqual(liveIds(e, U, 'items', 60_000), []);
});

test('another user and another scope see nothing', () => {
    const e = addEntries([], U, 'items', [1], 0);
    assert.deepEqual(liveIds(e, 8, 'items', 1), []);
    assert.deepEqual(liveIds(e, U, 'tickets', 1), []);
});

test('string ids work', () => {
    const e = addEntries([], U, 'roles', ['manager'], 0);
    assert.deepEqual(liveIds(e, U, 'roles', 5), ['manager']);
});

test('next expiry is the soonest live pin, none when nothing is live', () => {
    let e = addEntries([], U, 'a', [1], 0);
    e = addEntries(e, U, 'b', [2], 20_000);
    assert.equal(nextExpiry(e, 30_000), 30_000);
    assert.equal(nextExpiry(e, 80_000), null);
    assert.equal(nextExpiry([], 0), null);
});

test('dropping removes only the matching user, scope and id', () => {
    let e: NewRowEntry[] = addEntries([], U, 'items', [1, 2], 0);
    e = addEntries(e, 8, 'items', [1], 0);
    e = addEntries(e, U, 'tickets', [1], 0);
    e = dropEntry(e, U, 'items', 1);
    assert.deepEqual(liveIds(e, U, 'items', 1), [2]);
    assert.deepEqual(liveIds(e, 8, 'items', 1), [1]);
    assert.deepEqual(liveIds(e, U, 'tickets', 1), [1]);
});

test('pruning keeps only live pins', () => {
    let e = addEntries([], U, 'items', [1], 0);
    e = addEntries(e, U, 'items', [2], 50_000);
    assert.deepEqual(
        pruneExpired(e, 70_000).map((x) => x.id),
        [2],
    );
});

test('a pinned row leaves the page rows so it is drawn once', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    assert.deepEqual(
        splitPinned(rows, [{ id: 2 }], (r) => r.id),
        [{ id: 1 }, { id: 3 }],
    );
});

test('a pin whose record is gone or hidden is dropped', () => {
    assert.equal(dropOnMissing(404), true);
    assert.equal(dropOnMissing(403), true);
    assert.equal(dropOnMissing(500), false);
    assert.equal(dropOnMissing(undefined), false);
});

test('a pin that ran out keeps its place below the live ones until the list changes', () => {
    assert.deepEqual(pinOrder([3], [1, 2]), [3, 1, 2]);
    assert.deepEqual(pinOrder([1], [1, 2]), [1, 2]);
    assert.deepEqual(pinOrder([], []), []);
});

test('a reload keeps only live, well-formed pins', () => {
    const live = { user: U, scope: 'items', id: 1, at: 50_000 };
    const old = { user: U, scope: 'items', id: 2, at: 0 };
    assert.deepEqual(restoreEntries({ entries: [live, old, { junk: true }] }, 70_000), [live]);
    assert.deepEqual(restoreEntries(undefined, 70_000), []);
    assert.deepEqual(restoreEntries({ entries: 'x' }, 70_000), []);
});

test('another signed-in user drops every pin that is not theirs', () => {
    let e = addEntries([], U, 'items', [1], 0);
    e = addEntries(e, 8, 'items', [2], 0);
    assert.deepEqual(
        forUser(e, 8).map((x) => x.id),
        [2],
    );
    assert.deepEqual(forUser(e, null), []);
});
