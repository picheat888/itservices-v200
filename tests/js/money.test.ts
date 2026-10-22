// Money typed into forms: sanitised to 2 decimals, grouped while typing, padded from stored amounts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupMoney, sanitizeMoney, toMoneyText, unpadMoney } from '../../resources/js/shared/lib/money.ts';

test('sanitizeMoney keeps digits, the first dot and at most 2 decimals', () => {
    assert.equal(sanitizeMoney('38,500'), '38500');
    assert.equal(sanitizeMoney('1,234.567'), '1234.56');
    assert.equal(sanitizeMoney('12.3.4'), '12.34');
    assert.equal(sanitizeMoney('฿-12a.5'), '12.5');
    assert.equal(sanitizeMoney(''), '');
    assert.equal(sanitizeMoney('12345678901234567'), '1234567890123');
    assert.equal(sanitizeMoney('12345678901234567.891'), '1234567890123.89');
    assert.equal(sanitizeMoney('12345678901.5', 10), '1234567890.5');
});

test('groupMoney groups the whole part and keeps what is typed after the dot', () => {
    assert.equal(groupMoney('1234567', 'en'), '1,234,567');
    assert.equal(groupMoney('1234.5', 'th'), '1,234.5');
    assert.equal(groupMoney('1234.', 'en'), '1,234.');
    assert.equal(groupMoney('.5', 'en'), '0.5');
    assert.equal(groupMoney('', 'en'), '');
});

test('toMoneyText gives exactly 2 decimals or blank', () => {
    assert.equal(toMoneyText(38500), '38500.00');
    assert.equal(toMoneyText('1234.5'), '1234.50');
    assert.equal(toMoneyText('.'), '');
    assert.equal(toMoneyText(null), '');
    assert.equal(toMoneyText(undefined), '');
    assert.equal(toMoneyText(''), '');
});

test('unpadMoney drops trailing decimal zeros so digits can be added at the end', () => {
    assert.equal(unpadMoney('38500.00'), '38500');
    assert.equal(unpadMoney('12.50'), '12.5');
    assert.equal(unpadMoney('100.00'), '100');
    assert.equal(unpadMoney('0.00'), '0');
    assert.equal(unpadMoney('100'), '100');
    assert.equal(unpadMoney('12.34'), '12.34');
});
