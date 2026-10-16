// Dashboard links follow the module rights; a Dashboard switch alone opens nothing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashLinks } from '../../resources/js/modules/dashboard/lib/links.ts';

test('a reader with no module rights gets numbers but no links', () => {
    const links = dashLinks(() => false);
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
    const granted = new Set(['tickets.module', 'tickets.view_all', 'requests.submit', 'contracts.module']);
    const links = dashLinks((permission) => granted.has(permission));
    assert.equal(links.myJobs, '/tickets?tab=mine');
    assert.equal(links.pickup, '/tickets?tab=all&status=open');
    assert.equal(links.approvals, '/requests?tab=approvals');
    assert.equal(links.expiring, '/contracts?tab=all&status=expiring');
    assert.equal(links.ticket(7), '/tickets?view=7');
    assert.equal(links.request(9), '/requests?view=9');
    // Overseeing every request needs requests.view_all.
    assert.equal(links.awaitingIt, null);
});
