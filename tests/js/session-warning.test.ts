// When the idle warning opens, how its ring is coloured, what a screen reader hears, and how tabs share one idle clock.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    clock,
    crossedAnnouncement,
    dismissesWarning,
    heartbeatMsFor,
    isOtherAccount,
    newerActivity,
    parseSessionMessage,
    pingDelay,
    shouldShareActivity,
    spokenTime,
    toneFor,
    warnSecondsFor,
} from '../../resources/js/modules/auth/lib/session-warning.ts';

test('warning opens at half the timeout, never more than two minutes before', () => {
    const cases: [number, number][] = [
        [1, 30],
        [5, 120],
        [10, 120],
        [15, 120],
        [30, 120],
        [60, 120],
        [120, 120],
    ];
    for (const [minutes, seconds] of cases) {
        assert.equal(warnSecondsFor(minutes), seconds, `${minutes} min`);
    }
});

test('no timeout means no warning', () => {
    assert.equal(warnSecondsFor(0), 0);
});

test('ring colour follows the share of the warning left', () => {
    assert.equal(toneFor(120, 120), 'ok');
    assert.equal(toneFor(61, 120), 'ok');
    assert.equal(toneFor(60, 120), 'warn');
    assert.equal(toneFor(31, 120), 'warn');
    assert.equal(toneFor(30, 120), 'danger');
    assert.equal(toneFor(1, 120), 'danger');
    // A one-minute timeout warns for 30 s and still starts green
    assert.equal(toneFor(30, 30), 'ok');
    assert.equal(toneFor(15, 30), 'warn');
    assert.equal(toneFor(7, 30), 'danger');
});

test('clock always reads minutes and seconds', () => {
    assert.equal(clock(105), '1:45');
    assert.equal(clock(120), '2:00');
    assert.equal(clock(45), '0:45');
    assert.equal(clock(5), '0:05');
});

test('spoken time names minutes and seconds in words', () => {
    const words = { minutes: (n: number) => `${n} min`, seconds: (n: number) => `${n} s` };
    assert.equal(spokenTime(120, words), '2 min');
    assert.equal(spokenTime(75, words), '1 min 15 s');
    assert.equal(spokenTime(30, words), '30 s');
});

test('a milestone is announced once, when the countdown reaches it', () => {
    assert.equal(crossedAnnouncement(61, 60), 60);
    assert.equal(crossedAnnouncement(60, 59), null);
    assert.equal(crossedAnnouncement(31, 30), 30);
    assert.equal(crossedAnnouncement(11, 10), 10);
    assert.equal(crossedAnnouncement(45, 44), null);
    // A throttled background tab can skip seconds; the lowest milestone passed is announced
    assert.equal(crossedAnnouncement(65, 25), 30);
});

test('activity from another tab only ever moves the clock forward', () => {
    assert.equal(newerActivity(1000, '2000'), 2000);
    assert.equal(newerActivity(3000, '2000'), 3000);
    assert.equal(newerActivity(3000, null), 3000);
    assert.equal(newerActivity(3000, 'garbage'), 3000);
    assert.equal(newerActivity(3000, 2500), 3000);
    assert.equal(newerActivity(3000, 4000), 4000);
});

test('a tab shares its activity at most every few seconds', () => {
    assert.equal(shouldShareActivity(10_000, 0), true);
    assert.equal(shouldShareActivity(10_000, 6_000), false);
    assert.equal(shouldShareActivity(10_000, 5_000), true);
});

test('only activity after the warning opened closes it', () => {
    assert.equal(dismissesWarning(5_000, 6_000), true);
    assert.equal(dismissesWarning(5_000, 5_000), false);
    assert.equal(dismissesWarning(5_000, 4_000), false);
});

test('messages between tabs are checked before they are trusted', () => {
    assert.deepEqual(parseSessionMessage({ type: 'activity', at: 123 }), { type: 'activity', at: 123 });
    assert.deepEqual(parseSessionMessage({ type: 'logout' }), { type: 'logout' });
    assert.deepEqual(parseSessionMessage({ type: 'login', userId: 7 }), { type: 'login', userId: 7 });
    assert.equal(parseSessionMessage({ type: 'login' }), null);
    assert.equal(parseSessionMessage({ type: 'login', userId: '7' }), null);
    assert.equal(parseSessionMessage({ type: 'login', userId: 1.5 }), null);
    assert.equal(parseSessionMessage({ type: 'activity' }), null);
    assert.equal(parseSessionMessage({ type: 'other', at: 1 }), null);
    assert.equal(parseSessionMessage('logout'), null);
    assert.equal(parseSessionMessage(null), null);
});

test('a tab follows a sign-in only when the account changed', () => {
    assert.equal(isOtherAccount(150, 1), true);
    assert.equal(isOtherAccount(150, 150), false);
    // Nobody shown yet, or the session is gone: the 401 path handles that, not a reload
    assert.equal(isOtherAccount(null, 1), false);
    assert.equal(isOtherAccount(150, null), false);
});

test('the server hears about activity often enough for the shortest timeout', () => {
    assert.equal(heartbeatMsFor(1), 20_000);
    assert.equal(heartbeatMsFor(5), 60_000);
    assert.equal(heartbeatMsFor(120), 60_000);
    // Timeout unknown or off here (stale settings): still ping, at the server's grace
    assert.equal(heartbeatMsFor(0), 60_000);
});

test('a ping goes out now, or once the last one is a heartbeat old', () => {
    assert.equal(pingDelay(100_000, 0, 60_000), 0);
    assert.equal(pingDelay(100_000, 40_000, 60_000), 0);
    assert.equal(pingDelay(100_000, 70_000, 60_000), 30_000);
});
