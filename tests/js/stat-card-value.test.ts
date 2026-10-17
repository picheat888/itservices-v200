// StatCard value: plain numbers and numeric strings are grouped; codes and fractions stay as given.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatStatValue } from '../../resources/js/shared/lib/number.ts';

test('numbers and numeric strings get separators', () => {
    assert.equal(formatStatValue(12345, 'th'), '12,345');
    assert.equal(formatStatValue('12345', 'en'), '12,345');
    assert.equal(formatStatValue('1234.5', 'en'), '1,234.5');
    assert.equal(formatStatValue('-1500', 'th'), '-1,500');
});

test('anything that is not a plain number is left alone', () => {
    assert.equal(formatStatValue('12/3400', 'en'), '12/3400');
    assert.equal(formatStatValue('TK-1234', 'en'), 'TK-1234');
    assert.equal(formatStatValue('2026', 'en'), '2,026');
});
