// One Role Template switch flipped on the real card specs: what it takes along, and that it agrees with the rebase edges.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { specEdges } from '../../resources/js/modules/permission/lib/draft-rebase.ts';
import { cascadeToggle, specKeys } from '../../resources/js/modules/permission/lib/permission-count.ts';
import {
    cardSpec,
    NOTIFICATION_COUNT,
    REQUEST_COUNT,
    REQUEST_TREE,
    STOCK_COUNT,
    TICKET_COUNT,
    TREE_COUNT,
} from '../../resources/js/modules/permission/lib/permission-specs.ts';

const set = (...keys: string[]) => new Set(keys);
const sorted = (s: Set<string>) => [...s].sort();
const SUBMIT_TYPES = REQUEST_TREE.groups[0].children;

test('a child on brings its view and the master', () => {
    assert.deepEqual(sorted(cascadeToggle(set(), 'stock.receive', STOCK_COUNT)), ['stock.module', 'stock.receive', 'stock.view']);
});

test('a view off clears its children; the master off clears everything under it and nothing else', () => {
    const full = set(...specKeys(STOCK_COUNT), 'tickets.my');
    assert.ok(!cascadeToggle(full, 'stock.view', STOCK_COUNT).has('stock.receive'));
    assert.deepEqual(sorted(cascadeToggle(full, 'stock.module', STOCK_COUNT)), ['tickets.my']);
});

test('ticket self-service stands outside the master; a level brings the master', () => {
    const allTickets = set(...specKeys(TICKET_COUNT));
    assert.deepEqual(sorted(cascadeToggle(allTickets, 'tickets.module', TICKET_COUNT)), ['tickets.create', 'tickets.edit_own', 'tickets.my']);
    assert.deepEqual(sorted(cascadeToggle(set(), 'tickets.edit_own', TICKET_COUNT)), ['tickets.create', 'tickets.edit_own']);
    assert.deepEqual(sorted(cascadeToggle(set(), 'tickets.level_cctv', TICKET_COUNT)), ['tickets.level_cctv', 'tickets.module']);
    assert.deepEqual(sorted(cascadeToggle(set('tickets.create', 'tickets.edit_own'), 'tickets.create', TICKET_COUNT)), []);
});

test('request filing fills every type on grant; the last type off turns filing off', () => {
    const granted = cascadeToggle(set('requests.module'), 'requests.submit', REQUEST_COUNT);
    assert.ok(SUBMIT_TYPES.every((key) => granted.has(key)));

    let draft = set('requests.module', 'requests.submit', SUBMIT_TYPES[0], SUBMIT_TYPES[1]);
    draft = cascadeToggle(draft, SUBMIT_TYPES[0], REQUEST_COUNT);
    assert.ok(draft.has('requests.submit'));
    draft = cascadeToggle(draft, SUBMIT_TYPES[1], REQUEST_COUNT);
    assert.deepEqual(sorted(draft), ['requests.module']);
});

test('a flat card: any switch on brings the master', () => {
    assert.deepEqual(sorted(cascadeToggle(set(), 'notifications.logs', NOTIFICATION_COUNT)), ['notifications.logs', 'notifications.module']);
});

test('every card: a switch on never leaves a child above an off parent, a switch off never strands one', () => {
    for (const [module, spec] of Object.entries(TREE_COUNT)) {
        const edges = specEdges(spec);
        const orphans = (draft: Set<string>) => edges.filter((e) => draft.has(e.child) && !draft.has(e.parent)).map((e) => `${e.parent}>${e.child}`);
        const keys = specKeys(spec);
        assert.equal(new Set(keys).size, keys.length, `${module}: a key listed twice`);
        assert.ok(
            keys.every((key) => key.startsWith(`${module}.`)),
            `${module}: a key from another module`,
        );
        for (const key of keys) {
            assert.deepEqual(orphans(cascadeToggle(set(), key, spec)), [], `${module}: ${key} on`);
            assert.deepEqual(orphans(cascadeToggle(set(...keys), key, spec)), [], `${module}: ${key} off`);
        }
    }
});

test('each card gets its spec: trees by module, flat Administration cards on their master key, the rest free', () => {
    assert.deepEqual(cardSpec({ module: 'tickets', keys: [] }), { spec: TICKET_COUNT, liveOnly: false });
    assert.deepEqual(cardSpec({ module: 'profile', keys: ['profile.edit'] }), { spec: { free: ['profile.edit'] }, liveOnly: false });
    assert.deepEqual(cardSpec({ module: 'dashboard', keys: ['dashboard.view_it'] }), { spec: { free: ['dashboard.view_it'] }, liveOnly: true });

    const settings = cardSpec({ module: 'settings', keys: ['settings.access', 'settings.company'] });
    assert.deepEqual(settings, { spec: { master: 'settings.access', gated: ['settings.company'] }, liveOnly: true });
    assert.deepEqual(sorted(cascadeToggle(set(), 'settings.company', settings.spec)), ['settings.access', 'settings.company']);
    assert.equal(
        cardSpec({ module: 'permissions', keys: ['system.manage_permissions', 'system.manage_roles'] }).spec.master,
        'system.manage_permissions',
    );
});
