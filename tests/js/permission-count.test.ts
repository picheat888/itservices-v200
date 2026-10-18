// Role Template counts: card headers and section totals share countGranted, so a fully-on role reads full.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countGranted, hiddenHitCount, specKeys, type CountSpec } from '../../resources/js/modules/permission/lib/permission-count.ts';
import { TICKET_COUNT as TICKETS } from '../../resources/js/modules/permission/lib/permission-specs.ts';
const holds =
    (...keys: string[]) =>
    (key: string) =>
        keys.includes(key);

test('every key the card shows, master first, each once', () => {
    const keys = specKeys(TICKETS);
    assert.equal(keys[0], 'tickets.module');
    assert.deepEqual(keys.slice(-3), ['tickets.create', 'tickets.edit_own', 'tickets.my']);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(keys.length, 17);
});

test('a role holding everything reads full', () => {
    assert.deepEqual(
        countGranted(TICKETS, () => true),
        { on: 17, total: 17 },
    );
});

test('nothing under an off master counts; the keys outside it still do', () => {
    const has = holds('tickets.view_all', 'tickets.resolve', 'tickets.level_network', 'tickets.create', 'tickets.my');
    assert.deepEqual(countGranted(TICKETS, has), { on: 2, total: 17 });
});

test('a child counts only while its view is on', () => {
    const has = holds('tickets.module', 'tickets.resolve', 'tickets.edit_own', 'tickets.level_hardware');
    assert.equal(countGranted(TICKETS, has).on, 2);
});

test('a card with no master counts its free keys', () => {
    assert.deepEqual(countGranted({ free: ['profile.edit', 'profile.return_assets'] }, holds('profile.edit')), { on: 1, total: 2 });
});

test('a flat card counts only the keys its has() accepts (live keys)', () => {
    const spec: CountSpec = { master: 'settings.access', gated: ['settings.company', 'settings.soon'] };
    const live = (key: string) => key !== 'settings.soon';
    assert.deepEqual(
        countGranted(spec, (key) => live(key)),
        { on: 2, total: 3 },
    );
});

test('hidden hits are the matching keys under an off master', () => {
    const isHit = (key: string) => key.includes('resolve') || key.includes('my') || key.includes('level');
    // resolve and the six levels; "my" stands outside the master
    assert.equal(hiddenHitCount(TICKETS, holds(), isHit), 7);
    assert.equal(hiddenHitCount(TICKETS, holds('tickets.module'), isHit), 0);
    assert.equal(
        hiddenHitCount({ free: ['profile.edit'] }, holds(), () => true),
        0,
    );
});
