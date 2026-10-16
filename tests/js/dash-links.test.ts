// Dashboard links follow the module rights; a Dashboard switch alone opens nothing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashLinks } from '../../resources/js/modules/dashboard/lib/links.ts';

test('a reader with no module rights gets numbers but no links', () => {
    const links = dashLinks(() => false, false);
    assert.equal(links.pickup, null);
    assert.equal(links.awaitingIt, null);
    assert.equal(links.expiring, null);
    assert.equal(links.ticketsHome, null);
    assert.equal(links.ticket(5), null);
    assert.equal(links.requestsStatus('pending'), null);
    assert.equal(links.requestsAll, null);
    assert.equal(links.auditLog, null);
});

test('module rights open the matching lists', () => {
    const granted = new Set(['tickets.module', 'tickets.jobs', 'tickets.view_all', 'requests.submit', 'contracts.module']);
    const links = dashLinks((permission) => granted.has(permission), true);
    assert.equal(links.myJobs, '/tickets?tab=mine');
    assert.equal(links.pickup, '/tickets?tab=all&status=open');
    assert.equal(links.approvals, '/requests?tab=approvals');
    assert.equal(links.expiring, '/contracts?tab=all&status=expiring');
    assert.equal(links.ticket(7), '/tickets?view=7');
    assert.equal(links.request(9), '/requests?view=9');
    // Overseeing every request needs requests.view_all.
    assert.equal(links.awaitingIt, null);
});

test('each link lands on the tab or drawer section that opens for the reader', () => {
    const granted = new Set(['tickets.module', 'tickets.create', 'requests.view_all', 'system.manage_permissions']);
    const links = dashLinks((permission) => granted.has(permission), false);
    // The Tickets tabs answer to tickets.jobs / tickets.my, not the module master.
    assert.equal(links.myJobs, null);
    assert.equal(links.myTickets, null);
    // The audit-log tab needs system.view_audit as well.
    assert.equal(links.auditLog, null);
    // The drawer's Assets and Access tabs need a linked employee; its Requests tab needs requests.submit.
    assert.equal(links.profileAssets, null);
    assert.equal(links.profileAccess, null);
    assert.equal(links.myRequests, null);
});

test('my requests open the profile drawer list, never every request in the system', () => {
    const granted = new Set(['requests.submit', 'requests.view_all', 'tickets.jobs', 'tickets.my', 'system.manage_permissions', 'system.view_audit']);
    const links = dashLinks((permission) => granted.has(permission), true);
    assert.equal(links.myRequests, '?dialog=profile&section=requests');
    assert.equal(links.profileAssets, '?dialog=profile&section=assets');
    assert.equal(links.profileAccess, '?dialog=profile&section=access');
    assert.equal(links.myJobs, '/tickets?tab=mine');
    assert.equal(links.myTickets, '/tickets?tab=my');
    assert.equal(links.auditLog, '/permissions?tab=logs');
});
