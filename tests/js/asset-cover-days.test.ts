// Days left on a warranty or lease count calendar days, so the last day reads 0 at any hour (AST-13).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverDaysLeft } from '../../resources/js/modules/asset/lib/cover-days.ts';

const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h);

test('the last day is 0 both before and after 7 in the morning', () => {
    assert.equal(coverDaysLeft('2026-10-30', at(2026, 10, 30, 6)), 0);
    assert.equal(coverDaysLeft('2026-10-30', at(2026, 10, 30, 10)), 0);
    assert.equal(Object.is(coverDaysLeft('2026-10-30', at(2026, 10, 30, 23)), -0), false);
});

test('the day before is 1 at any hour, and the day after is -1', () => {
    assert.equal(coverDaysLeft('2026-10-30', at(2026, 10, 29, 6)), 1);
    assert.equal(coverDaysLeft('2026-10-30', at(2026, 10, 29, 23)), 1);
    assert.equal(coverDaysLeft('2026-10-30', at(2026, 10, 31, 0)), -1);
});

test('a span across a month and a year end counts whole days', () => {
    assert.equal(coverDaysLeft('2027-01-02', at(2026, 12, 30, 12)), 3);
    assert.equal(coverDaysLeft('2026-11-28', at(2026, 10, 30, 12)), 29);
});
