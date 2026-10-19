// App-wide API failure rules: which failures a query retries, which error screen wins, and the inline-shown mark that stops a duplicate toast.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    isNetworkFailure,
    markShownInline,
    outranks,
    quietPathAfterMove,
    retryAfterOf,
    serviceUnavailableKind,
    shouldRetryQuery,
    shouldShowAppError,
    showsOwnThrottle,
    wasShownInline,
} from '../../resources/js/shared/lib/http-errors.ts';

const answered = (status: number, headers: Record<string, unknown> = {}) => ({ config: { method: 'get' }, response: { status, headers } });
const dropped = { config: { method: 'get' }, code: 'ERR_NETWORK' };

test('a query retries a 5xx and a dropped connection, twice at most', () => {
    assert.equal(shouldRetryQuery(0, answered(500)), true);
    assert.equal(shouldRetryQuery(1, answered(502)), true);
    assert.equal(shouldRetryQuery(2, answered(500)), false);
    assert.equal(shouldRetryQuery(0, dropped), true);
});

test('a 503 is not retried: the server asked the reader to wait', () => {
    assert.equal(shouldRetryQuery(0, answered(503, { 'retry-after': '15' })), false);
});

test('a 503 that says server_busy is the busy kind, any other 503 is maintenance', () => {
    const busy = { config: { method: 'get' }, response: { status: 503, headers: {}, data: { message: 'server_busy' } } };
    const down = { config: { method: 'get' }, response: { status: 503, headers: {}, data: { message: 'Service Unavailable' } } };
    assert.equal(serviceUnavailableKind(busy), 'busy');
    assert.equal(serviceUnavailableKind(down), 'maintenance');
    assert.equal(serviceUnavailableKind(answered(503)), 'maintenance');
});

test('a busy server outranks a server error, maintenance outranks busy', () => {
    assert.equal(outranks('busy', 'server'), true);
    assert.equal(outranks('maintenance', 'busy'), true);
    assert.equal(outranks('server', 'busy'), false);
});

test('a query does not retry an answer that will not change', () => {
    for (const status of [401, 403, 404, 419, 422, 429]) {
        assert.equal(shouldRetryQuery(0, answered(status)), false, `status ${status}`);
    }
    assert.equal(shouldRetryQuery(0, new TypeError('x is undefined')), false);
});

test('a request the app cancelled is not a dropped connection', () => {
    assert.equal(isNetworkFailure({ config: {}, code: 'ERR_CANCELED' }), false);
    assert.equal(isNetworkFailure(dropped), true);
    assert.equal(isNetworkFailure(answered(500)), false);
});

test('Retry-After is read as whole seconds, or null when unusable', () => {
    assert.equal(retryAfterOf(answered(429, { 'retry-after': '42' })), 42);
    assert.equal(retryAfterOf(answered(503, { 'retry-after': '0' })), null);
    assert.equal(retryAfterOf(answered(429, { 'retry-after': 'soon' })), null);
    assert.equal(retryAfterOf(answered(429)), null);
});

test('the first error stays on screen unless a more serious one arrives', () => {
    assert.equal(outranks('server', null), true);
    assert.equal(outranks('server', 'server'), false);
    assert.equal(outranks('network', 'server'), false);
    assert.equal(outranks('rate-limit', 'network'), false);
    assert.equal(outranks('server', 'network'), true);
    assert.equal(outranks('maintenance', 'server'), true);
});

test('a failure a form showed is remembered, others are not', () => {
    const shown = answered(500);
    const other = answered(500);
    markShownInline(shown);
    assert.equal(wasShownInline(shown), true);
    assert.equal(wasShownInline(other), false);
    assert.equal(wasShownInline(null), false);
});

test('a closed server dialog stays quiet on the same page and comes back on another', () => {
    assert.equal(shouldShowAppError('server', null, '/assets', '/assets'), false);
    assert.equal(shouldShowAppError('server', null, '/assets', '/tickets'), true);
    assert.equal(shouldShowAppError('network', null, '/assets', '/assets'), true);
    assert.equal(shouldShowAppError('server', 'server', null, '/assets'), false);
});

test('leaving the page where the server dialog was closed re-arms it', () => {
    assert.equal(quietPathAfterMove('/assets', '/tickets'), null);
    assert.equal(quietPathAfterMove('/assets', '/assets'), '/assets');
    assert.equal(quietPathAfterMove(null, '/assets'), null);
});

test('a 429 from the sign-in form or its device dialog is left to them, any other raises the wait screen', () => {
    assert.equal(showsOwnThrottle('/login'), true);
    assert.equal(showsOwnThrottle('/login/devices/12/sign-out'), true);
    assert.equal(showsOwnThrottle('/tickets'), false);
    assert.equal(showsOwnThrottle('/login-events'), false);
    assert.equal(showsOwnThrottle('/me/login-events'), false);
    assert.equal(showsOwnThrottle(undefined), false);
});
