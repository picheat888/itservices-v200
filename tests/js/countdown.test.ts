// The countdown maths shared by the idle warning and the error dialogs: clock text, seconds left, ring fill.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clock, elapsedShare, maintenanceLine, secondsLeft, waitSpoken, waitWords } from '../../resources/js/shared/lib/countdown.ts';

const words: Record<string, string> = {
    login_time_minutes: '{n} minutes',
    login_time_seconds: '{n} seconds',
    session_one_minute: '1 minute',
    session_one_second: '1 second',
    err_wait_spoken: 'You can try again in {time}.',
    err_maintenance_body: 'The system is being updated. You can use it again in about {n} minutes.',
    err_maintenance_body_one: 'The system is being updated. You can use it again in about a minute.',
    err_maintenance_later: 'The system is being updated. Please try again later.',
};
const t = (key: string) => words[key] ?? key;
const fmtN = (n: number) => String(n);

test('the clock reads minutes and seconds, past an hour too', () => {
    assert.equal(clock(105), '1:45');
    assert.equal(clock(120), '2:00');
    assert.equal(clock(45), '0:45');
    assert.equal(clock(5), '0:05');
    assert.equal(clock(3600), '60:00');
});

test('seconds left round up and never go below zero', () => {
    assert.equal(secondsLeft(10_000, 9_001), 1);
    assert.equal(secondsLeft(10_000, 10_000), 0);
    assert.equal(secondsLeft(10_000, 12_000), 0);
});

test('the ring fills as time passes and is full with no total', () => {
    assert.equal(elapsedShare(42, 42), 0);
    assert.equal(elapsedShare(21, 42), 0.5);
    assert.equal(elapsedShare(0, 42), 1);
    assert.equal(elapsedShare(5, 0), 1);
});

test('one minute and one second read in the singular', () => {
    assert.equal(waitWords(60, t, fmtN), '1 minute');
    assert.equal(waitWords(1, t, fmtN), '1 second');
});

test('longer waits read in the plural, minutes rounded up', () => {
    assert.equal(waitWords(61, t, fmtN), '2 minutes');
    assert.equal(waitWords(900, t, fmtN), '15 minutes');
    assert.equal(waitWords(45, t, fmtN), '45 seconds');
});

test('the error dialogs say the wait in words for screen readers', () => {
    assert.equal(waitSpoken(45, t, fmtN), 'You can try again in 45 seconds.');
    assert.equal(waitSpoken(120, t, fmtN), 'You can try again in 2 minutes.');
});

test('maintenance names the minutes to wait, a single minute in words', () => {
    assert.equal(maintenanceLine(600, t, fmtN), 'The system is being updated. You can use it again in about 10 minutes.');
    assert.equal(maintenanceLine(45, t, fmtN), 'The system is being updated. You can use it again in about a minute.');
    assert.equal(maintenanceLine(null, t, fmtN), 'The system is being updated. Please try again later.');
});
