// localName: Thai when present, English otherwise.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localName, localPair, nameSearch } from '../../resources/js/shared/lib/local-name.ts';

test('Thai shows name_th and falls back to name when it is empty', () => {
    assert.equal(localName({ name: 'Sales', name_th: 'ฝ่ายขาย' }, 'th'), 'ฝ่ายขาย');
    assert.equal(localName({ name: 'Sales', name_th: null }, 'th'), 'Sales');
    assert.equal(localName({ name: 'Sales', name_th: '' }, 'th'), 'Sales');
    assert.equal(localName({ name: 'Sales' }, 'th'), 'Sales');
});

test('English always shows name; a missing record is null', () => {
    assert.equal(localName({ name: 'Sales', name_th: 'ฝ่ายขาย' }, 'en'), 'Sales');
    assert.equal(localName(null, 'th'), null);
});

test('search text holds both names', () => {
    assert.equal(nameSearch({ name: 'Sales', name_th: 'ฝ่ายขาย' }), 'Sales ฝ่ายขาย');
    assert.equal(nameSearch({ name: 'Sales', name_th: null }), 'Sales');
});

test('localPair localizes a name + twin pair and keeps null for no name', () => {
    assert.equal(localPair('Sales', 'ฝ่ายขาย', 'th'), 'ฝ่ายขาย');
    assert.equal(localPair('Sales', null, 'th'), 'Sales');
    assert.equal(localPair('Sales', 'ฝ่ายขาย', 'en'), 'Sales');
    assert.equal(localPair(null, 'ฝ่ายขาย', 'th'), null);
    assert.equal(localPair(undefined, undefined, 'th'), null);
});
