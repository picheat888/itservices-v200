// Role delete block: which refusal key the page shows, the Role Group reason before the members one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roleDeleteBlockKey } from '../../resources/js/modules/permission/lib/role-delete-block.ts';

test('a system role is blocked as a system role', () => {
    assert.equal(roleDeleteBlockKey({ is_system: true, members: 0, groups: 0 }), 'role_del_blocked_system');
});

test('a role used by a group names the group, with or without members', () => {
    assert.equal(roleDeleteBlockKey({ is_system: false, members: 5, groups: 1 }), 'role_del_blocked_group');
    assert.equal(roleDeleteBlockKey({ is_system: false, members: 0, groups: 1 }), 'role_del_blocked_group');
});

test('members block only when no group uses the role', () => {
    assert.equal(roleDeleteBlockKey({ is_system: false, members: 5, groups: 0 }), 'role_del_blocked_members');
});

test('an unused role is not blocked', () => {
    assert.equal(roleDeleteBlockKey({ is_system: false, members: 0, groups: 0 }), null);
});
