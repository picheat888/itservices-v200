// Role Template counts: card headers and section totals share countGranted, so a fully-on role reads full.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countGranted, hiddenHitCount, specKeys, type CountSpec } from '../../resources/js/modules/permission/lib/permission-count.ts';

const TICKETS: CountSpec = {
    master: 'tickets.module',
    groups: [
        { view: 'tickets.view_dashboard', children: [] },
        { view: 'tickets.view_all', children: ['tickets.resolve', 'tickets.assign'] },
    ],
    gated: ['tickets.level_hardware', 'tickets.level_network'],
    standalone: [{ view: 'tickets.create', children: ['tickets.edit_own'] }],
    free: ['tickets.my'],
};
const holds =
    (...keys: string[]) =>
    (key: string) =>
        keys.includes(key);

test('every key the card shows, master first', () => {
    assert.deepEqual(specKeys(TICKETS), [
        'tickets.module',
        'tickets.view_dashboard',
        'tickets.view_all',
        'tickets.resolve',
        'tickets.assign',
        'tickets.level_hardware',
        'tickets.level_network',
        'tickets.create',
        'tickets.edit_own',
        'tickets.my',
    ]);
});

test('a role holding everything reads full', () => {
    assert.deepEqual(
        countGranted(TICKETS, () => true),
        { on: 10, total: 10 },
    );
});

test('nothing under an off master counts; the keys outside it still do', () => {
    const has = holds('tickets.view_all', 'tickets.resolve', 'tickets.level_network', 'tickets.create', 'tickets.my');
    assert.deepEqual(countGranted(TICKETS, has), { on: 2, total: 10 });
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
    assert.equal(hiddenHitCount(TICKETS, holds(), isHit), 3);
    assert.equal(hiddenHitCount(TICKETS, holds('tickets.module'), isHit), 0);
    assert.equal(
        hiddenHitCount({ free: ['profile.edit'] }, holds(), () => true),
        0,
    );
});
