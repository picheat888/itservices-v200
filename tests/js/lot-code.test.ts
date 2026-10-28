// parseLotCode: finds the LOT-YYYYMMDD-NNNN number in what a scanner or a pasted link gives.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLotCode } from '../../resources/js/modules/stock/lib/lot-code.ts';

test('finds the number inside a full link with a query string', () => {
    assert.equal(parseLotCode('https://itservices.example/stock/lots/LOT-20261028-0002?from=qr'), 'LOT-20261028-0002');
});

test('upper-cases a lower case number', () => {
    assert.equal(parseLotCode('lot-20260930-0001'), 'LOT-20260930-0001');
});

test('accepts a bare number and a longer sequence', () => {
    assert.equal(parseLotCode('LOT-20260812-0003'), 'LOT-20260812-0003');
    assert.equal(parseLotCode('  LOT-20260812-12345 '), 'LOT-20260812-12345');
});

test('an EAN barcode is not a lot', () => {
    assert.equal(parseLotCode('8851234567890'), null);
});

test('a date with 7 digits is not a lot', () => {
    assert.equal(parseLotCode('LOT-2026102-0001'), null);
});

test('an empty scan is not a lot', () => {
    assert.equal(parseLotCode(''), null);
});
