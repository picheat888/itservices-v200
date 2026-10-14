// When the idle warning opens, how its ring is coloured, and what a screen reader hears.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clock, crossedAnnouncement, spokenTime, toneFor, warnSecondsFor } from '../../resources/js/modules/auth/lib/session-warning.ts';

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
