// A report links into a module only when the module's sidebar gate (permission or anyOf) lets the reader in.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canOpenNavItem, canOpenRecord } from '../../resources/js/modules/report/lib/can-open.ts';

const allow =
    (...keys: string[]) =>
    (p: string) =>
        keys.includes(p);

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

test('a record link needs the right the record page checks, not just the menu', () => {
    const submitter = allow('requests.module', 'tickets.my', 'reports.module', 'reports.requests');
    assert.equal(canOpenRecord('/requests?view=7', submitter), false);
    assert.equal(canOpenRecord('/tickets?view=5', submitter), false);
    assert.equal(canOpenRecord('/requests?view=7', allow('requests.complete')), true);
    assert.equal(canOpenRecord('/tickets?view=5', allow('tickets.view_all')), true);
    assert.equal(canOpenRecord('/assets?view=3', allow('assets.module')), false);
    assert.equal(canOpenRecord('/assets?view=3', allow('assets.view')), true);
    assert.equal(canOpenRecord('/contracts?view=2', allow('contracts.view')), true);
    assert.equal(canOpenRecord('/employees?view=9', allow('employees.module')), false);
    assert.equal(canOpenRecord('/access?tab=software&view=4', allow('access.module')), false);
    assert.equal(canOpenRecord('/access?tab=software&view=4', allow('access.software_view')), true);
    assert.equal(canOpenRecord('/access?tab=email-groups&view=4', allow('access.software_view')), false);
    assert.equal(canOpenRecord('/access?tab=email-groups&view=4', allow('access.email_view')), true);
    assert.equal(canOpenRecord('/access?tab=file-shares&view=4', allow('access.file_view')), true);
});

test('a link without a record opens on the menu gate alone', () => {
    assert.equal(canOpenRecord('/reports/access-overview', allow()), true);
    assert.equal(canOpenRecord('/assets?tab=inventory&status=active', allow('assets.view')), true);
});
