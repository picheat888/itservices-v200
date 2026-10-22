// When the page sums up missed bells, when it rings, and how two windows share one ring.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    AWAY_MS,
    catchUpSince,
    claimRing,
    FIRST_OPEN_LOOKBACK_MS,
    shouldRingInPage,
    summaryLines,
} from '../../resources/js/modules/notification/lib/arrival-rules.ts';

const NOW = new Date(2026, 9, 22, 12, 0).getTime();

/** A Storage stand-in over a Map, keeping insertion order for key(i). */
function fakeStorage(seed: Record<string, string> = {}) {
    const map = new Map(Object.entries(seed));
    return {
        map,
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, String(v)),
        removeItem: (k: string) => void map.delete(k),
        key: (i: number) => [...map.keys()][i] ?? null,
        get length() {
            return map.size;
        },
    };
}

test('the windows are 30 minutes and 24 hours', () => {
    assert.equal(AWAY_MS, 1_800_000);
    assert.equal(FIRST_OPEN_LOOKBACK_MS, 86_400_000);
});

test('first ever open looks back 24 hours', () => assert.equal(catchUpSince(null, NOW), NOW - 86_400_000));

test('a return within 30 minutes on the same day gets no summary', () => assert.equal(catchUpSince(NOW - 29 * 60_000, NOW), null));

test('a return after exactly 30 minutes counts from the last time seen', () => assert.equal(catchUpSince(NOW - 30 * 60_000, NOW), NOW - 30 * 60_000));

test('a return after 30 minutes counts from the last time seen', () => assert.equal(catchUpSince(NOW - 31 * 60_000, NOW), NOW - 31 * 60_000));

test('a new day counts from yesterday even if only minutes passed', () => {
    const lastSeen = new Date(2026, 9, 21, 23, 55).getTime();
    const now = new Date(2026, 9, 22, 0, 5).getTime();
    assert.equal(catchUpSince(lastSeen, now), lastSeen);
});

test('no new rows means no summary even with a backlog', () => assert.equal(summaryLines(0, 150), null));

test('the total line hides when it equals the new count', () => assert.equal(summaryLines(12, 12)!.showTotal, false));

test('the total line shows when more are unread than arrived', () =>
    assert.deepEqual(summaryLines(3, 20), { newCount: 3, unreadTotal: 20, showTotal: true }));

test('a visible tab always rings', () => {
    assert.equal(shouldRingInPage(true, true), true);
    assert.equal(shouldRingInPage(true, false), true);
});

test('a hidden tab stays quiet when this device has push on', () => assert.equal(shouldRingInPage(false, true), false));

test('a hidden tab rings when this device has no push', () => assert.equal(shouldRingInPage(false, false), true));

test('only the first tab claims a ring', () => {
    const store = fakeStorage();
    assert.equal(claimRing('n1', store, NOW), true);
    assert.equal(claimRing('n1', store, NOW + 10), false);
    assert.equal(store.getItem('itsd.rang.n1'), String(NOW));
    assert.equal(claimRing('n2', store, NOW + 20), true);
});

test('claims older than an hour are pruned, newer ones and other keys stay', () => {
    const store = fakeStorage({
        'itsd.rang.old': String(NOW - 61 * 60_000),
        'itsd.rang.recent': String(NOW - 30 * 60_000),
        'itsd.rang.junk': 'x',
        'itsd.lastSeenAt.1': String(NOW - 5 * 3_600_000),
    });
    claimRing('n3', store, NOW);
    assert.deepEqual([...store.map.keys()].sort(), ['itsd.lastSeenAt.1', 'itsd.rang.n3', 'itsd.rang.recent']);
});

test('a storage that throws still lets the tab ring', () => {
    const broken = {
        getItem: () => {
            throw new Error('denied');
        },
        setItem: () => {
            throw new Error('denied');
        },
        removeItem: () => undefined,
        key: () => null,
        length: 0,
    };
    assert.equal(claimRing('n4', broken, NOW), true);
});
