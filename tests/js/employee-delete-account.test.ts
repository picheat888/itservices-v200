// Employee delete: the viewer's own record and, for a non-super viewer, a Super admin account are never deletable.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountDeleteBlockers, accountDeleteRefusal } from '../../resources/js/modules/employee/lib/delete-account.ts';

const staff = { id: 7, username: 'sam', is_super_admin: false };
const admin = { id: 9, username: 'root', is_super_admin: true };
const viewer = { employee_id: 3, username: 'tom' };

test('someone else with no admin account has no account blocker', () => {
    assert.deepEqual(accountDeleteBlockers(staff, viewer, false), []);
});

test('the viewer own record by employee link', () => {
    assert.deepEqual(accountDeleteBlockers(staff, { employee_id: 7, username: 'tom' }, false), ['own_account']);
});

test('the viewer own record by username link', () => {
    assert.deepEqual(accountDeleteBlockers(staff, { employee_id: null, username: 'sam' }, false), ['own_account']);
});

test('the username link ignores case, like the database collation', () => {
    assert.deepEqual(accountDeleteBlockers(staff, { employee_id: null, username: 'SAM' }, false), ['own_account']);
    assert.deepEqual(accountDeleteBlockers({ ...staff, username: 'Sam' }, { employee_id: null, username: 'sam' }, false), ['own_account']);
});

test('a blank username never links', () => {
    assert.deepEqual(accountDeleteBlockers({ ...staff, username: null }, { employee_id: null, username: null }, false), []);
});

test('a Super admin account blocks a non-super viewer only', () => {
    assert.deepEqual(accountDeleteBlockers(admin, viewer, false), ['super_account']);
    assert.deepEqual(accountDeleteBlockers(admin, viewer, true), []);
});

test('no viewer yet means no own-record blocker', () => {
    assert.deepEqual(accountDeleteBlockers(staff, null, false), []);
});

test('a refused delete names its account blocker', () => {
    assert.equal(accountDeleteRefusal({ response: { status: 403, data: { message: 'own_account', code: 'own_account_delete' } } }), 'own_account');
    assert.equal(accountDeleteRefusal({ response: { status: 403, data: { message: 'super_account' } } }), 'super_account');
    assert.equal(accountDeleteRefusal({ response: { status: 422, data: { message: 'has_activity' } } }), undefined);
    assert.equal(accountDeleteRefusal(new Error('Network Error')), undefined);
});
