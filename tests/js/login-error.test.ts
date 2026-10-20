// The words a failed sign-in shows: lockout, busy sign-ins, wrong credentials, closed account, expired confirmation, outage, no connection.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginErrorText, waitWords } from '../../resources/js/modules/auth/lib/login-error.ts';

const words: Record<string, string> = {
    login_err_server: 'Cannot reach the server.',
    login_err_throttled: 'Too many attempts. Try again in {time}.',
    login_err_throttled_wait: 'Too many attempts. Wait a moment.',
    login_err_busy: 'Too many sign-ins right now. Try again in {time}.',
    login_err_busy_wait: 'Too many sign-ins right now. Wait a moment.',
    login_err_closed: 'This account is closed.',
    login_pending_expired: 'Confirmation timed out.',
    login_error: 'Invalid username or password.',
    login_err_reload: 'Reload the page and try again.',
    login_time_minutes: '{n} minutes',
    login_time_seconds: '{n} seconds',
    session_one_minute: '1 minute',
    session_one_second: '1 second',
    err_server_body: 'The server ran into a problem. Try again.',
    err_maintenance_later: 'Under maintenance. Try again later.',
};
const t = (key: string) => words[key] ?? key;
const fmtN = (n: number) => String(n);
const answer = (status: number, data: unknown = {}, headers: Record<string, string> = {}) => ({ response: { status, data, headers } });
const text = (error: unknown) => loginErrorText(error, t, fmtN);

test('one minute and one second read in the singular', () => {
    assert.equal(waitWords(60, t, fmtN), '1 minute');
    assert.equal(waitWords(1, t, fmtN), '1 second');
});
test('longer waits read in the plural, minutes rounded up', () => {
    assert.equal(waitWords(61, t, fmtN), '2 minutes');
    assert.equal(waitWords(900, t, fmtN), '15 minutes');
    assert.equal(waitWords(45, t, fmtN), '45 seconds');
});

test('no answer at all is a connection problem', () => assert.equal(text(new Error('Network Error')), 'Cannot reach the server.'));
test('a lockout names the wait', () =>
    assert.equal(text(answer(429, { message: 'too_many_attempts', retry_after: 60 })), 'Too many attempts. Try again in 1 minute.'));
test('a busy network is not called a run of wrong passwords', () =>
    assert.equal(text(answer(429, { message: 'too_many_sign_ins', retry_after: 30 })), 'Too many sign-ins right now. Try again in 30 seconds.'));
test('a busy answer without a wait asks for a moment', () =>
    assert.equal(text(answer(429, { message: 'too_many_sign_ins' })), 'Too many sign-ins right now. Wait a moment.'));
test('the app-wide limiter only sends the header', () =>
    assert.equal(text(answer(429, { message: 'Too Many Attempts.' }, { 'retry-after': '120' })), 'Too many attempts. Try again in 2 minutes.'));
test('wrong credentials', () => assert.equal(text(answer(422, { message: 'Invalid' })), 'Invalid username or password.'));
test('a closed account', () => assert.equal(text(answer(403, { message: 'account_closed' })), 'This account is closed.'));
test('an expired confirmation', () => assert.equal(text(answer(403, { message: 'pending_expired' })), 'Confirmation timed out.'));
test('a server error is not called a connection problem', () => assert.equal(text(answer(500)), 'The server ran into a problem. Try again.'));
test('maintenance says so', () => assert.equal(text(answer(503)), 'Under maintenance. Try again later.'));
test('a page whose token went stale asks for a reload', () => assert.equal(text(answer(419)), 'Reload the page and try again.'));
