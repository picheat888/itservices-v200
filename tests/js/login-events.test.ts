// The words a login-log row shows: its event, the one reason line under it, and whether it is a failure.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginEventWords } from '../../resources/js/modules/auth/lib/login-events.ts';

const t = (key: string) => key;
const user = { id: 1, name: 'A', name_th: null, username: 'a' };

test('a plain sign-in has no reason line', () =>
    assert.deepEqual(loginEventWords({ event: 'signed_in', reason: null, remembered: false, user }, t), {
        event: 'login_event_signed_in',
        reason: null,
        failed: false,
    }));

test('a remembered sign-in says so on the reason line', () =>
    assert.equal(loginEventWords({ event: 'signed_in', reason: null, remembered: true, user }, t).reason, 'login_reason_remembered'));

test('a forced sign-out names its reason', () =>
    assert.deepEqual(loginEventWords({ event: 'forced_out', reason: 'third_device', remembered: false, user }, t), {
        event: 'login_event_forced_out',
        reason: 'login_reason_third_device',
        failed: false,
    }));

test('a self sign-out carries no reason line even when the API names one', () =>
    assert.equal(loginEventWords({ event: 'signed_out', reason: 'signed_out', remembered: false, user }, t).reason, null));

test('wrong passwords and locks are failures', () => {
    assert.equal(loginEventWords({ event: 'failed', reason: null, remembered: false, user }, t).failed, true);
    assert.equal(loginEventWords({ event: 'locked', reason: null, remembered: false, user }, t).failed, true);
});

test('a failure on a name nobody owns says the account was not found', () =>
    assert.equal(loginEventWords({ event: 'failed', reason: null, remembered: false, user: null }, t).reason, 'login_reason_unknown_account'));

test('a failure on a known account has no reason line', () =>
    assert.equal(loginEventWords({ event: 'failed', reason: null, remembered: false, user }, t).reason, null));
