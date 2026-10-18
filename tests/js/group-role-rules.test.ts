// Role Group rules: the singular lang key, which role templates a caller may hand out, and which groups may become the default.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countKey, defaultOffReasonKey, isOverCeiling, leaversWhere, removeLine } from '../../resources/js/modules/permission/lib/group-rules.ts';

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

test('an unknown role (no matrix) or no role leaves the choice to the server', () => {
    assert.equal(defaultOffReasonKey(group(5, 'gone'), 1, undefined, false, mine), null);
    assert.equal(off(group(6, null), 1), null);
});

const words: Record<string, string> = {
    gr_where_group: 'they move to {name}',
    gr_where_none: 'no group, {role} role',
    gr_confirm_remove: 'Remove {n} people ({where})',
};
const tr = (key: string) => words[key] ?? key;

test('leavers go to the default group first, else to the base role', () => {
    assert.equal(leaversWhere(tr, 'Staff group', 'User'), 'they move to Staff group');
    assert.equal(leaversWhere(tr, null, 'User'), 'no group, User role');
});

test('with no default group and no base role label the destination is unknown', () => {
    assert.equal(leaversWhere(tr, null, ''), null);
    assert.equal(removeLine(tr, '2', null, ''), 'Remove 2 people');
    assert.equal(removeLine(tr, '2', null, 'User'), 'Remove 2 people (no group, User role)');
});
