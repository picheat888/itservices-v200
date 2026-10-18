// Permission refusals: a server code picks its lang key, anything else falls back to the server or the generic error.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRoleChanged, permissionRefusalText, refusalKey } from '../../resources/js/modules/permission/lib/refusal.ts';

const t = (key: string) => `T:${key}`;
const refused = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });

test('each known code has its own key', () => {
    assert.equal(refusalKey('default_group_super'), 'perm_refusal_default_group_super');
    assert.equal(refusalKey('admin_members_protected'), 'perm_refusal_admin_members_protected');
    assert.equal(refusalKey('last_super_admin'), 'perm_refusal_last_super_admin');
    assert.equal(refusalKey('own_access'), 'perm_refusal_own_access');
    assert.equal(refusalKey('grant_ceiling'), 'perm_refusal_grant_ceiling');
    assert.equal(refusalKey('role_changed'), 'perm_refusal_role_changed');
});

test('an unknown or missing code has no key', () => {
    assert.equal(refusalKey('something_else'), undefined);
    assert.equal(refusalKey(undefined), undefined);
    assert.equal(refusalKey(42), undefined);
});

test('a known code is worded by its key, not the server message', () => {
    const error = refused(403, { message: 'You cannot change your own role group membership or its role.', code: 'own_access' });
    assert.equal(permissionRefusalText(error, t), 'T:perm_refusal_own_access');
});

test('an unknown code falls back to the server message', () => {
    const error = refused(403, { message: 'Only an Administrator can manage the Administrator role group.' });
    assert.equal(permissionRefusalText(error, t), 'Only an Administrator can manage the Administrator role group.');
});

test('no code and no message falls back to the generic error', () => {
    assert.equal(permissionRefusalText(refused(500, {}), t), 'T:cd_error');
    assert.equal(permissionRefusalText(new Error('Network Error'), t), 'T:cd_error');
    assert.equal(permissionRefusalText(undefined, t), 'T:cd_error');
});

test('a stale role save is told apart and worded by its key', () => {
    const stale = refused(409, { code: 'role_changed', message: 'This role was changed by someone else.' });
    assert.equal(isRoleChanged(stale), true);
    assert.equal(isRoleChanged(refused(409, { code: 'other' })), false);
    assert.equal(isRoleChanged(refused(422, { code: 'role_changed' })), false);
    assert.equal(isRoleChanged(new Error('network')), false);
    assert.equal(permissionRefusalText(stale, t), 'T:perm_refusal_role_changed');
});
