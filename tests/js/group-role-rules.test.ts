// Role Group rules: the singular lang key for one, and which role templates a caller may hand out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countKey, isOverCeiling } from '../../resources/js/modules/permission/lib/group-rules.ts';

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
