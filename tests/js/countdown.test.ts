// The countdown maths shared by the idle warning and the error dialogs: clock text, seconds left, ring fill.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clock, elapsedShare, secondsLeft } from '../../resources/js/shared/lib/countdown.ts';

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
