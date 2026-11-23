// An amount per billing cycle, worded in the reader's language (/mo, /qtr, /yr or their Thai forms).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cycleSuffix, perCycle } from '../../resources/js/shared/lib/currency.ts';

const t = (key: string) => `[${key}]`;

test('each billing cycle has its own suffix key', () => {
    assert.equal(perCycle('฿100.00', 'monthly', t), '฿100.00[contract_per_month]');
    assert.equal(perCycle('฿100.00', 'quarterly', t), '฿100.00[contract_per_quarter]');
    assert.equal(perCycle('฿100.00', 'yearly', t), '฿100.00[contract_per_year]');
});

test('an amount with no cycle is shown as it is', () => {
    assert.equal(perCycle('฿100.00', null, t), '฿100.00');
    assert.equal(perCycle('฿100.00', undefined, t), '฿100.00');
});

test('the cycle suffix alone, for a table that prints it under the amount', () => {
    assert.equal(cycleSuffix('monthly', t), '[contract_per_month]');
    assert.equal(cycleSuffix('yearly', t), '[contract_per_year]');
    assert.equal(cycleSuffix(null, t), '');
    assert.equal(cycleSuffix('weekly', t), '');
});
