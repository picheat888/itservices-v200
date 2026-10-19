// One Role Template switch flipped on the real card specs: what it takes along, and that it agrees with the rebase edges.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cardCountSpec, countingHas, type CardLayout } from '../../resources/js/modules/permission/lib/card-layout.ts';
import { specEdges } from '../../resources/js/modules/permission/lib/draft-rebase.ts';
import { cascadeToggle, specKeys, type CountSpec } from '../../resources/js/modules/permission/lib/permission-count.ts';

const layout: CardLayout[] = JSON.parse(readFileSync(join(import.meta.dirname, '../Fixtures/permission-layout.json'), 'utf8'));
const specOf = (module: string): CountSpec => cardCountSpec(layout.find((card) => card.module === module)!);
const STOCK_COUNT = specOf('stock');
const TICKET_COUNT = specOf('tickets');
const REQUEST_COUNT = specOf('requests');
const NOTIFICATION_COUNT = specOf('notifications');

const set = (...keys: string[]) => new Set(keys);
const sorted = (s: Set<string>) => [...s].sort();
const SUBMIT_TYPES = REQUEST_COUNT.groups!.find((g) => g.view === 'requests.submit')!.children;

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
    for (const card of layout) {
        const module = card.module;
        const spec = cardCountSpec(card);
        const edges = specEdges(spec);
        const orphans = (draft: Set<string>) => edges.filter((e) => draft.has(e.child) && !draft.has(e.parent)).map((e) => `${e.parent}>${e.child}`);
        const keys = specKeys(spec);
        assert.equal(new Set(keys).size, keys.length, `${module}: a key listed twice`);
        const prefix = keys[0].slice(0, keys[0].indexOf('.') + 1);
        assert.ok(
            keys.every((key) => key.startsWith(prefix)),
            `${module}: a key from another module`,
        );
        for (const key of keys) {
            assert.deepEqual(orphans(cascadeToggle(set(), key, spec)), [], `${module}: ${key} on`);
            assert.deepEqual(orphans(cascadeToggle(set(...keys), key, spec)), [], `${module}: ${key} off`);
        }
    }
});

test('each card gets its spec: flat Administration cards on their master key, profile and dashboard free, live-only where coming-soon aware', () => {
    const all = () => true;
    const live = (key: string) => key !== 'dashboard.view_hr';
    assert.deepEqual(specOf('profile'), { free: ['profile.edit', 'profile.return_assets'] });
    assert.equal(specOf('dashboard').free?.length, 5);
    assert.equal(countingHas(layout.find((c) => c.module === 'dashboard')!, all, live)('dashboard.view_hr'), false);
    assert.equal(countingHas(layout.find((c) => c.module === 'profile')!, all, () => false)('profile.edit'), true);

    const settings = specOf('settings');
    assert.equal(settings.master, 'settings.access');
    assert.ok(settings.gated?.includes('settings.company'));
    assert.deepEqual(sorted(cascadeToggle(set(), 'settings.company', settings)), ['settings.access', 'settings.company']);
    assert.equal(specOf('permissions').master, 'system.manage_permissions');
});
