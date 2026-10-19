// The Login tab's URL values: which event filter and which date range a link may carry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOGIN_EVENT_FILTERS, readLoginEvent, readLoginRange } from '../../resources/js/modules/permission/lib/login-log-params.ts';

test('every event the server knows is a choice', () =>
    assert.deepEqual([...LOGIN_EVENT_FILTERS], ['signed_in', 'failed', 'locked', 'signed_out', 'forced_out']));

test('a known event is kept', () => assert.equal(readLoginEvent('locked'), 'locked'));
test('an unknown event means every event', () => assert.equal(readLoginEvent('exploded'), ''));
test('no event means every event', () => assert.equal(readLoginEvent(''), ''));
test('the "all" word of the select is not an event', () => assert.equal(readLoginEvent('all'), ''));

test('a valid pair is a range', () => assert.deepEqual(readLoginRange('2026-10-01', '2026-10-19'), { from: '2026-10-01', to: '2026-10-19' }));
test('one day is a range', () => assert.deepEqual(readLoginRange('2026-10-19', '2026-10-19'), { from: '2026-10-19', to: '2026-10-19' }));
test('a range needs both ends', () => {
    assert.equal(readLoginRange('2026-10-01', ''), null);
    assert.equal(readLoginRange('', '2026-10-19'), null);
});
test('a range running backwards is dropped', () => assert.equal(readLoginRange('2026-10-19', '2026-10-01'), null));
test('text that is not a day is dropped', () => {
    assert.equal(readLoginRange('yesterday', '2026-10-19'), null);
    assert.equal(readLoginRange('2026-10-01', '2026-10-1'), null);
});
test('a day that does not exist is dropped', () => {
    assert.equal(readLoginRange('2026-02-30', '2026-03-05'), null);
    assert.equal(readLoginRange('2026-13-01', '2026-13-02'), null);
});
test('a leap day exists only in a leap year', () => {
    assert.deepEqual(readLoginRange('2028-02-29', '2028-03-01'), { from: '2028-02-29', to: '2028-03-01' });
    assert.equal(readLoginRange('2027-02-29', '2027-03-01'), null);
});
