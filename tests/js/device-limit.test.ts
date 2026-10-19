// The sign-in dialog for a full account: when "เข้าสู่ระบบ" unlocks, how a device and its place read, and how a 409 / 403 answer is told apart.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    canContinue,
    deviceLimitOf,
    deviceLine,
    isPendingExpired,
    pendingMinutes,
    placeLine,
    signedOutByLine,
} from '../../resources/js/modules/auth/lib/device-limit.ts';

const words: Record<string, string> = {
    device_other: 'Other',
    login_notice_by: '{device} in {location} at {time}',
    login_notice_by_no_location: '{device} at {time}',
};
const t = (key: string) => words[key] ?? key;

const device = (patch: Partial<{ os: string; browser: string; ip: string | null; location: string | null }> = {}) => ({
    id: 4,
    os: 'Windows',
    browser: 'Chrome',
    ip: '10.0.0.5',
    location: 'Head office',
    signed_in_at: '2026-10-19T08:00:00+07:00',
    last_active_at: '2026-10-19T09:00:00+07:00',
    remembered: false,
    remember_expires_at: null,
    current: false,
    ...patch,
});

const answer = (status: number, data: unknown) => ({ response: { status, data } });

test('nobody signed out yet: the sign-in stays locked', () => assert.equal(canContinue(new Set()), false));
test('one device signed out unlocks the sign-in', () => assert.equal(canContinue(new Set([4])), true));
test('several signed out still unlock it', () => assert.equal(canContinue(new Set([4, 9])), true));

test('a device reads "OS, browser"', () => assert.equal(deviceLine(device(), t), 'Windows, Chrome'));
test('the "Other" family is worded through the dictionary', () =>
    assert.equal(deviceLine(device({ os: 'Other', browser: 'Other' }), t), 'Other, Other'));
test('a family that is not "Other" is shown as the server sent it', () =>
    assert.equal(deviceLine(device({ os: 'iPadOS', browser: 'Safari' }), t), 'iPadOS, Safari'));

test('a place reads "location (ip)"', () => assert.equal(placeLine(device()), 'Head office (10.0.0.5)'));
test('no location leaves the ip alone', () => assert.equal(placeLine(device({ location: null })), '10.0.0.5'));
test('no ip leaves the location alone', () => assert.equal(placeLine(device({ ip: null })), 'Head office'));
test('neither a location nor an ip leaves nothing to show', () => assert.equal(placeLine(device({ ip: null, location: null })), ''));

test('the 409 device_limit body is read into the dialog data', () => {
    const body = { message: 'device_limit', limit: 2, pending: 'tok', expires_in: 300, devices: [device()] };
    assert.deepEqual(deviceLimitOf(answer(409, body)), { limit: 2, pending: 'tok', expires_in: 300, devices: [device()] });
});
test('a 409 without a usable time limit still opens the dialog, with no time to show', () => {
    const body = { message: 'device_limit', limit: 2, pending: 'tok', expires_in: 'soon', devices: [device()] };
    assert.equal(deviceLimitOf(answer(409, body))?.expires_in, null);
});
test('the time limit reads in whole minutes, rounded up', () => {
    assert.equal(pendingMinutes(300), 5);
    assert.equal(pendingMinutes(90), 2);
    assert.equal(pendingMinutes(null), null);
    assert.equal(pendingMinutes(0), null);
});
test('a 409 with another message is not a device limit', () => assert.equal(deviceLimitOf(answer(409, { message: 'other' })), null));
test('a device_limit body on another status is not a device limit', () =>
    assert.equal(deviceLimitOf(answer(422, { message: 'device_limit' })), null));
test('a 409 without a token or a device list is not usable', () => {
    assert.equal(deviceLimitOf(answer(409, { message: 'device_limit', limit: 2, devices: [] })), null);
    assert.equal(deviceLimitOf(answer(409, { message: 'device_limit', limit: 2, pending: 'tok' })), null);
});
test('no response at all is not a device limit', () => assert.equal(deviceLimitOf(new Error('offline')), null));

test('403 pending_expired is an expired confirmation', () => assert.equal(isPendingExpired(answer(403, { message: 'pending_expired' })), true));
test('another 403 is not', () => assert.equal(isPendingExpired(answer(403, { message: 'account_closed' })), false));
test('pending_expired on another status is not', () => assert.equal(isPendingExpired(answer(404, { message: 'pending_expired' })), false));

test('the "signed out by" line names the device, place and time', () => {
    const by = { os: 'macOS', browser: 'Safari', location: 'Bangkok, Thailand', at: '2026-10-19T09:30:00+07:00' };
    assert.equal(
        signedOutByLine(by, t, () => '19/10/2026 09:30'),
        'macOS, Safari in Bangkok, Thailand at 19/10/2026 09:30',
    );
});
test('the "signed out by" line drops the place when it is unknown', () => {
    const by = { os: 'macOS', browser: 'Safari', location: null, at: '2026-10-19T09:30:00+07:00' };
    assert.equal(
        signedOutByLine(by, t, () => '19/10/2026 09:30'),
        'macOS, Safari at 19/10/2026 09:30',
    );
});
