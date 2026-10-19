// Role Templates: a reader cannot edit the role they use, unless it is the super role.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOwnRole } from '../../resources/js/modules/permission/lib/own-role.ts';

test('the role the reader uses is their own', () => {
    assert.equal(isOwnRole({ value: 'it_supervisor', is_super: false }, 'it_supervisor'), true);
});

test('another role is not', () => {
    assert.equal(isOwnRole({ value: 'it_support', is_super: false }, 'it_supervisor'), false);
});

test('the super role is locked by its own rule, never as an own role', () => {
    assert.equal(isOwnRole({ value: 'admin', is_super: true }, 'admin'), false);
});

test('no signed-in role matches nothing', () => {
    assert.equal(isOwnRole({ value: 'staff', is_super: false }, undefined), false);
});
