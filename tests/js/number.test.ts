// formatNumber: grouped digits in a fixed locale, never the browser's.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatNumber } from '../../resources/js/shared/lib/number.ts';

test('groups thousands in both languages with Latin digits', () => {
    assert.equal(formatNumber(1234567, 'th'), '1,234,567');
    assert.equal(formatNumber(1234567, 'en'), '1,234,567');
    assert.equal(formatNumber(-1500, 'th'), '-1,500');
    assert.equal(formatNumber(0, 'en'), '0');
});

test('decimals are fixed or capped', () => {
    assert.equal(formatNumber(1234.5, 'en', { decimals: 2 }), '1,234.50');
    assert.equal(formatNumber(1234.5, 'en', { maxDecimals: 1 }), '1,234.5');
    assert.equal(formatNumber(1234, 'en', { maxDecimals: 1 }), '1,234');
    assert.equal(formatNumber(12.345, 'th', { maxDecimals: 2 }), '12.35');
});
