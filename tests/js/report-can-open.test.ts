// A report links into a module only when the module's sidebar gate (permission or anyOf) lets the reader in.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canOpenNavItem } from '../../resources/js/modules/report/lib/can-open.ts';

const allow = (...keys: string[]) => (p: string) => keys.includes(p);

test('an entry gated by a single permission needs that permission', () => {
    const assets = { permission: 'assets.module' };
    assert.equal(canOpenNavItem(assets, allow('reports.module', 'reports.assets')), false);
    assert.equal(canOpenNavItem(assets, allow('assets.module')), true);
});

test('an entry gated by anyOf needs one of them', () => {
    const tickets = { anyOf: ['tickets.module', 'tickets.create', 'tickets.my'] };
    assert.equal(canOpenNavItem(tickets, allow('reports.tickets')), false);
    assert.equal(canOpenNavItem(tickets, allow('tickets.my')), true);
});

test('an ungated entry opens and an unknown path does not', () => {
    assert.equal(canOpenNavItem({}, allow()), true);
    assert.equal(canOpenNavItem(undefined, allow('assets.module')), false);
});
