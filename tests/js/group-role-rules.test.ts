// Role Group rules: the singular lang key, role names, which role templates a caller may hand out, the default group and "Everyone in".
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    BASE_ROLE_KEY,
    baseRoleLabel,
    countKey,
    defaultOffReasonKey,
    departmentLockKey,
    findRole,
    isOverCeiling,
    leaversWhere,
    removeLine,
    roleLabel,
} from '../../resources/js/modules/permission/lib/group-rules.ts';

test('one picks the _one key, anything else the plain key', () => {
    assert.equal(countKey('gr_people', 1), 'gr_people_one');
    assert.equal(countKey('gr_people', 0), 'gr_people');
    assert.equal(countKey('gr_people', 2), 'gr_people');
    assert.equal(countKey('gr_people', 1500), 'gr_people');
});

const role = (permissions: string[], isSuper = false) => ({ is_super: isSuper, permissions });
const mine = new Set(['tickets.view', 'assets.view']);

test('a Super admin may hand out any role', () => {
    assert.equal(isOverCeiling(role(['x.y'], true), true, new Set()), false);
    assert.equal(isOverCeiling(role(['x.y']), true, new Set()), false);
});

test('a non-super caller may hand out only roles within their own permissions', () => {
    assert.equal(isOverCeiling(role(['tickets.view']), false, mine), false);
    assert.equal(isOverCeiling(role([]), false, mine), false);
    assert.equal(isOverCeiling(role(['tickets.view', 'stock.view']), false, mine), true);
});

test('a non-super caller may never hand out the Super admin role', () => {
    assert.equal(isOverCeiling(role([], true), false, mine), true);
});

const group = (id: number, roleKey: string | null) => ({ id, role: roleKey });
const roles = { super: role([], true), ops: role(['tickets.view']), wide: role(['stock.view']) };
const off = (g: { id: number; role: string | null }, defaultId: number | null, isSuper = false) =>
    defaultOffReasonKey(g, defaultId, g.role ? roles[g.role as keyof typeof roles] : undefined, isSuper, mine);

test('the current default group is never greyed out', () => {
    assert.equal(off(group(1, 'super'), 1), null);
    assert.equal(off(group(1, 'wide'), 1), null);
});

test('a Super admin group cannot become the default, even for a Super admin', () => {
    assert.equal(off(group(2, 'super'), 1), 'gr_default_super_off');
    assert.equal(off(group(2, 'super'), null, true), 'gr_default_super_off');
});

test('a group above the caller is greyed out with the ceiling reason', () => {
    assert.equal(off(group(3, 'wide'), 1), 'perm_refusal_grant_ceiling');
    assert.equal(off(group(3, 'wide'), 1, true), null);
    assert.equal(off(group(4, 'ops'), 1), null);
});

test('an unknown role or no role leaves the choice to the server', () => {
    assert.equal(defaultOffReasonKey(group(5, 'gone'), 1, undefined, false, mine), null);
    assert.equal(off(group(6, null), 1), null);
});

const words: Record<string, string> = {
    gr_where_group: 'they move to {name}',
    gr_where_none: 'no group, {role} role',
    gr_confirm_remove: 'Remove {n} people ({where})',
    gr_confirm_remove_one: 'Remove 1 person ({where})',
};
const tr = (key: string) => words[key] ?? key;

test('leavers go to the default group first, else to the base role', () => {
    assert.equal(leaversWhere(tr, 'Staff group', 'User'), 'they move to Staff group');
    assert.equal(leaversWhere(tr, null, 'User'), 'no group, User role');
});

test('the remove line always names where leavers go', () => {
    assert.equal(removeLine(tr, 2, '2', null, 'User'), 'Remove 2 people (no group, User role)');
    assert.equal(removeLine(tr, 2, '2', 'Staff group', 'User'), 'Remove 2 people (they move to Staff group)');
});

test('one leaver reads in the singular', () => {
    assert.equal(removeLine(tr, 1, '1', 'Staff group', 'User'), 'Remove 1 person (they move to Staff group)');
    assert.equal(removeLine(tr, 1, '1', null, 'User'), 'Remove 1 person (no group, User role)');
});

const options = [
    { key: 'super', name: 'Super admin' },
    { key: 'user', name: 'User' },
    { key: 'ops', name: null },
];

test('a role reads by its name, else its key', () => {
    assert.equal(roleLabel(options[1]), 'User');
    assert.equal(roleLabel(options[2]), 'ops');
});

test('no role key finds the base role', () => {
    assert.equal(findRole(options, null)?.key, BASE_ROLE_KEY);
    assert.equal(findRole(options, 'ops')?.key, 'ops');
    assert.equal(findRole(options, 'gone'), undefined);
});

test('the base role label comes from the role list', () => {
    assert.equal(baseRoleLabel(options), 'User');
    assert.equal(baseRoleLabel([{ key: 'user', name: 'Staff' }]), 'Staff');
    assert.equal(baseRoleLabel([]), 'user');
});

test('"Everyone in" stays open while anyone can be added', () => {
    assert.equal(departmentLockKey(3, true, false), null);
    assert.equal(departmentLockKey(1, false, true), null);
});

test('"Everyone in" with nobody addable says why', () => {
    assert.equal(departmentLockKey(0, true, false), 'perm_refusal_grant_ceiling');
    assert.equal(departmentLockKey(0, true, true), 'perm_refusal_grant_ceiling');
    assert.equal(departmentLockKey(0, false, true), 'gr_your_account');
    assert.equal(departmentLockKey(0, false, false), 'gr_admin_only');
});
