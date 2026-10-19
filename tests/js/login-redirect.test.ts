// Several requests (or tabs) can fail at once when a session ends; only the first reason reaches the login page.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createLoginRedirect,
    loginNoticeReason,
    parseDeviceSignedOut,
    readSignedOutBy,
    serverFileTarget,
    signedOutRedirectFor,
} from '../../resources/js/shared/lib/login-redirect.ts';

test('the first reason wins when several requests fail together', () => {
    const target = { href: '/tickets' };
    const redirect = createLoginRedirect(target);

    redirect('session_expired');
    redirect('signed_out');

    assert.equal(target.href, '/login?reason=session_expired');
});

test('a single failure still goes to the login page with its reason', () => {
    const target = { href: '/' };
    createLoginRedirect(target)('signed_out');
    assert.equal(target.href, '/login?reason=signed_out');
});

test('an idle timeout is announced to the other tabs once', () => {
    let announced = 0;
    const redirect = createLoginRedirect({ href: '/' }, () => announced++);

    redirect('session_expired');
    redirect('session_expired');

    assert.equal(announced, 1);
});

test('a tab that heard the news does not announce it again, and a plain sign-out is not announced', () => {
    let announced = 0;
    createLoginRedirect({ href: '/' }, () => announced++)('session_expired', { announce: false });
    createLoginRedirect({ href: '/' }, () => announced++)('signed_out');

    assert.equal(announced, 0);
});

test('only a server file link is reopened after sign-in', () => {
    assert.equal(serverFileTarget('/files/report-exports/5?expires=1&signature=abc'), '/files/report-exports/5?expires=1&signature=abc');
    assert.equal(serverFileTarget('/pdf/stock-items/55/history'), '/pdf/stock-items/55/history');
    assert.equal(serverFileTarget(null), null);
    assert.equal(serverFileTarget('/tickets'), null);
    assert.equal(serverFileTarget('https://evil.example/files/x'), null);
    assert.equal(serverFileTarget('//evil.example/files/x'), null);
    assert.equal(serverFileTarget('/files//evil.example'), null);
    assert.equal(serverFileTarget('/files/\\evil'), null);
});

// Device sign-out reasons and the device that took the session's place

type FakeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function withSessionStorage(storage: FakeStorage): void {
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true, writable: true });
}

function memoryStorage(): FakeStorage & { values: Map<string, string> } {
    const values = new Map<string, string>();
    return {
        values,
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: (key) => void values.delete(key),
    };
}

function throwingStorage(): FakeStorage {
    const fail = () => {
        throw new Error('storage blocked');
    };
    return { getItem: fail, setItem: fail, removeItem: fail };
}

const BY = { os: 'Windows', browser: 'Chrome', location: 'Bangkok, Thailand', at: '2026-10-19T10:15:00+07:00' };

test('a device that was signed out for another one goes to the login page with its reason, and who took its place stays out of the URL', (t) => {
    const storage = memoryStorage();
    withSessionStorage(storage);
    t.after(() => Reflect.deleteProperty(globalThis, 'sessionStorage'));
    const target = { href: '/tickets' };

    createLoginRedirect(target)('third_device', { by: BY });

    assert.equal(target.href, '/login?reason=third_device');
    assert.equal(target.href.includes('Windows'), false);
    assert.deepEqual(JSON.parse(storage.values.get('itsd:signed-out-by') ?? 'null'), BY);
});

test('the device that took the place is read once, then gone', (t) => {
    withSessionStorage(memoryStorage());
    t.after(() => Reflect.deleteProperty(globalThis, 'sessionStorage'));

    createLoginRedirect({ href: '/' })('third_device', { by: BY });

    assert.deepEqual(readSignedOutBy(), BY);
    assert.equal(readSignedOutBy(), null);
});

test('a place taken by a device with no known location is still read back', (t) => {
    withSessionStorage(memoryStorage());
    t.after(() => Reflect.deleteProperty(globalThis, 'sessionStorage'));
    const unplaced = { ...BY, location: null };

    createLoginRedirect({ href: '/' })('third_device', { by: unplaced });

    assert.deepEqual(readSignedOutBy(), unplaced);
});

test('nothing is stored when no device is named', (t) => {
    const storage = memoryStorage();
    withSessionStorage(storage);
    t.after(() => Reflect.deleteProperty(globalThis, 'sessionStorage'));

    createLoginRedirect({ href: '/' })('signed_out');
    createLoginRedirect({ href: '/' })('limit', { by: null });

    assert.equal(storage.values.size, 0);
    assert.equal(readSignedOutBy(), null);
});

test('storage that refuses to work still signs the reader out and reads back nothing', (t) => {
    withSessionStorage(throwingStorage());
    t.after(() => Reflect.deleteProperty(globalThis, 'sessionStorage'));
    const target = { href: '/' };

    createLoginRedirect(target)('third_device', { by: BY });

    assert.equal(target.href, '/login?reason=third_device');
    assert.equal(readSignedOutBy(), null);
});

test('a missing storage reads back nothing', () => {
    Reflect.deleteProperty(globalThis, 'sessionStorage');
    assert.equal(readSignedOutBy(), null);
});

test('a stored value that is not a device is dropped', (t) => {
    const storage = memoryStorage();
    withSessionStorage(storage);
    t.after(() => Reflect.deleteProperty(globalThis, 'sessionStorage'));

    storage.values.set('itsd:signed-out-by', '{broken');
    assert.equal(readSignedOutBy(), null);

    storage.values.set('itsd:signed-out-by', JSON.stringify({ os: 'Windows' }));
    assert.equal(readSignedOutBy(), null);
    assert.equal(storage.values.size, 0);
});

test('the server reason for an ended device maps to the login notice', () => {
    const reasonOf = (reason: unknown) => parseDeviceSignedOut({ message: 'device_signed_out', reason, by: null })?.reason;

    assert.equal(reasonOf('third_device'), 'third_device');
    assert.equal(reasonOf('profile'), 'profile');
    assert.equal(reasonOf('limit'), 'limit');
    assert.equal(reasonOf('idle_timeout'), 'session_expired');
    assert.equal(reasonOf('password_changed'), 'signed_out');
    assert.equal(reasonOf('account_closed'), 'account_closed');
    assert.equal(reasonOf('something_new'), 'signed_out');
    assert.equal(reasonOf('constructor'), 'signed_out');
    assert.equal(reasonOf(undefined), 'signed_out');
});

test('the device that took the place comes with the ended-device answer, and only that answer', () => {
    assert.deepEqual(parseDeviceSignedOut({ message: 'device_signed_out', reason: 'third_device', by: BY }), { reason: 'third_device', by: BY });
    assert.equal(parseDeviceSignedOut({ message: 'device_signed_out', reason: 'third_device', by: 'Windows' })?.by, null);
    assert.equal(parseDeviceSignedOut({ message: 'session_expired' }), null);
    assert.equal(parseDeviceSignedOut({ message: 'Unauthenticated.' }), null);
    assert.equal(parseDeviceSignedOut(null), null);
    assert.equal(parseDeviceSignedOut('device_signed_out'), null);
});

test('a redirect that names no device clears the one an earlier sign-out left behind', (t) => {
    const storage = memoryStorage();
    withSessionStorage(storage);
    t.after(() => Reflect.deleteProperty(globalThis, 'sessionStorage'));

    storage.values.set('itsd:signed-out-by', JSON.stringify(BY));
    createLoginRedirect({ href: '/' })('signed_out');
    assert.equal(storage.values.size, 0);

    storage.values.set('itsd:signed-out-by', JSON.stringify(BY));
    createLoginRedirect({ href: '/' })('limit', { by: null });
    assert.equal(storage.values.size, 0);
    assert.equal(readSignedOutBy(), null);
});

test('a later redirect from the same page does not wipe the device the first one stored', (t) => {
    const storage = memoryStorage();
    withSessionStorage(storage);
    t.after(() => Reflect.deleteProperty(globalThis, 'sessionStorage'));
    const redirect = createLoginRedirect({ href: '/' });

    redirect('third_device', { by: BY });
    redirect('signed_out');

    assert.deepEqual(readSignedOutBy(), BY);
});

test('a clearing step on storage that refuses to work does not stop the redirect', (t) => {
    withSessionStorage(throwingStorage());
    t.after(() => Reflect.deleteProperty(globalThis, 'sessionStorage'));
    const target = { href: '/' };

    createLoginRedirect(target)('signed_out');

    assert.equal(target.href, '/login?reason=signed_out');
});

// Which failed answers send the reader to the login page, and why

const ENDED = { message: 'device_signed_out', reason: 'third_device', by: BY };
const request = (overrides: Partial<Parameters<typeof signedOutRedirectFor>[0]> = {}) => ({
    status: 401,
    url: '/tickets',
    quiet: false,
    pathname: '/tickets',
    body: { message: 'Unauthenticated.' },
    ...overrides,
});

test('a cold open whose /me comes back as an ended device goes to the login page with the reason and the device', () => {
    assert.deepEqual(signedOutRedirectFor(request({ url: '/me', pathname: '/', body: ENDED })), { reason: 'third_device', by: BY });
});

test('a plain /me 401 is left to the route guard', () => {
    assert.equal(signedOutRedirectFor(request({ url: '/me', pathname: '/' })), null);
    assert.equal(signedOutRedirectFor(request({ url: '/api/me', pathname: '/tickets' })), null);
});

test('a start-up request that expects a 401 is quiet unless the device was ended', () => {
    assert.equal(signedOutRedirectFor(request({ quiet: true })), null);
    assert.deepEqual(signedOutRedirectFor(request({ quiet: true, body: ENDED })), { reason: 'third_device', by: BY });
});

test('nothing on the login page redirects, so its own /me probe cannot loop', () => {
    assert.equal(signedOutRedirectFor(request({ url: '/me', pathname: '/login', body: ENDED })), null);
    assert.equal(signedOutRedirectFor(request({ pathname: '/login', body: ENDED })), null);
    assert.equal(signedOutRedirectFor(request({ pathname: '/login' })), null);
});

test('any other 401 on a working screen is a plain sign-out, and an ended device keeps its reason', () => {
    assert.deepEqual(signedOutRedirectFor(request()), { reason: 'signed_out', by: null });
    assert.deepEqual(signedOutRedirectFor(request({ body: undefined })), { reason: 'signed_out', by: null });
    assert.deepEqual(signedOutRedirectFor(request({ body: ENDED })), { reason: 'third_device', by: BY });
    assert.deepEqual(signedOutRedirectFor(request({ body: { message: 'device_signed_out', reason: 'idle_timeout', by: null } })), {
        reason: 'session_expired',
        by: null,
    });
});

test('an account closed while in use goes to the login page with its own notice, even from /me or a quiet request', () => {
    const closed = { message: 'account_closed' };
    assert.deepEqual(signedOutRedirectFor(request({ body: closed })), { reason: 'account_closed', by: null });
    assert.deepEqual(signedOutRedirectFor(request({ url: '/me', pathname: '/', body: closed })), { reason: 'account_closed', by: null });
    assert.deepEqual(signedOutRedirectFor(request({ quiet: true, body: closed })), { reason: 'account_closed', by: null });
    assert.equal(signedOutRedirectFor(request({ pathname: '/login', body: closed })), null);
    assert.equal(signedOutRedirectFor(request({ status: 403, body: closed })), null);
});

test('only a 401 can sign the reader out', () => {
    assert.equal(signedOutRedirectFor(request({ status: 403, body: ENDED })), null);
    assert.equal(signedOutRedirectFor(request({ status: 419 })), null);
    assert.equal(signedOutRedirectFor(request({ status: undefined })), null);
});

test('a file link redirect names the server reason, and the login page shows the same notice as the JSON answer', () => {
    assert.equal(loginNoticeReason('idle_timeout'), 'session_expired');
    assert.equal(loginNoticeReason('password_changed'), 'signed_out');
    assert.equal(loginNoticeReason('account_closed'), 'account_closed');
    assert.equal(loginNoticeReason('third_device'), 'third_device');
    assert.equal(loginNoticeReason('profile'), 'profile');
    assert.equal(loginNoticeReason('limit'), 'limit');
    for (const reason of ['idle_timeout', 'password_changed', 'account_closed', 'third_device', 'profile', 'limit']) {
        assert.equal(loginNoticeReason(reason), parseDeviceSignedOut({ message: 'device_signed_out', reason, by: null })?.reason, reason);
    }
});

test('the reasons the app itself puts in the URL keep their notice, and anything else shows none', () => {
    for (const reason of ['session_expired', 'signed_out', 'third_device', 'profile', 'limit', 'account_closed'] as const) {
        assert.equal(loginNoticeReason(reason), reason);
    }
    assert.equal(loginNoticeReason(null), null);
    assert.equal(loginNoticeReason(''), null);
    assert.equal(loginNoticeReason('something_new'), null);
    assert.equal(loginNoticeReason('constructor'), null);
});
