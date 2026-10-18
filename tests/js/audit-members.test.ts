// Audit added/removed lists: permission keys versus role group member names.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPermissionKey, splitAuditEntries } from '../../resources/js/modules/permission/lib/audit-members.ts';

test('permission keys are dotted snake case', () => {
    assert.equal(isPermissionKey('system.manage_groups'), true);
    assert.equal(isPermissionKey('tickets.level.all'), true);
    assert.equal(isPermissionKey('Sam Staff (EMP-0001)'), false);
    assert.equal(isPermissionKey('สมชาย ใจดี (EMP-0002)'), false);
    assert.equal(isPermissionKey('J. Doe (EMP-0003)'), false);
});

test('splits a role group entry into members', () => {
    assert.deepEqual(splitAuditEntries({ added: ['Sam Staff (EMP-0001)'], removed: ['Tom Staff (EMP-0002)'] }), {
        permissionsAdded: [],
        permissionsRemoved: [],
        membersAdded: ['Sam Staff (EMP-0001)'],
        membersRemoved: ['Tom Staff (EMP-0002)'],
    });
});

test('keeps a permission save as permissions', () => {
    assert.deepEqual(splitAuditEntries({ added: ['system.view_audit'] }), {
        permissionsAdded: ['system.view_audit'],
        permissionsRemoved: [],
        membersAdded: [],
        membersRemoved: [],
    });
});
