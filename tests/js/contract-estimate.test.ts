// CON-4: the contract total estimate counts the end date, as Contract::durationMonths() does.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractTotalEstimate, termMonths } from '../../resources/js/modules/contract/lib/estimate.ts';

test('a calendar year is 12 months, end date included', () => {
    assert.equal(termMonths('2026-01-01', '2026-12-31'), 12);
    assert.equal(termMonths('2026-01-15', '2027-01-14'), 12);
    assert.equal(termMonths('2026-02-01', '2026-02-28'), 1);
    assert.equal(termMonths('2026-01-31', '2026-02-27'), 0);
});

test('monthly, quarterly and yearly totals over one year', () => {
    assert.equal(contractTotalEstimate(10000, '2026-01-01', '2026-12-31', 'monthly'), 120000);
    assert.equal(contractTotalEstimate(30000, '2026-01-01', '2026-12-31', 'quarterly'), 120000);
    assert.equal(contractTotalEstimate(120000, '2026-01-01', '2026-12-31', 'yearly'), 120000);
    assert.equal(contractTotalEstimate(120000, '2026-01-01', '2028-12-31', 'yearly'), 360000);
});

test('no estimate without a value, dates, or with the end before the start; at least one cycle', () => {
    assert.equal(contractTotalEstimate(0, '2026-01-01', '2026-12-31', 'monthly'), null);
    assert.equal(contractTotalEstimate(100, '', '2026-12-31', 'monthly'), null);
    assert.equal(contractTotalEstimate(100, '2026-12-31', '2026-01-01', 'monthly'), null);
    assert.equal(contractTotalEstimate(100, '2026-01-01', '2026-01-10', 'yearly'), 100);
});
