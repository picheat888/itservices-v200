// The record line of the shared edit-save confirm: trimmed name and code, blank code dropped.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editConfirmEntity } from '../../resources/js/shared/lib/edit-confirm.ts';

test('name and code are trimmed', () => {
    assert.deepEqual(editConfirmEntity({ name: ' HP 58A ', sub: ' SKU-0000001 ' }), { name: 'HP 58A', sub: 'SKU-0000001' });
});

test('a record without a code shows the name only', () => {
    assert.deepEqual(editConfirmEntity({ name: 'ข้อมูลบริษัท' }), { name: 'ข้อมูลบริษัท' });
});

test('a blank code is dropped', () => {
    assert.deepEqual(editConfirmEntity({ name: 'X', sub: '  ' }), { name: 'X' });
});

test('a missing name falls back to a dash', () => {
    assert.deepEqual(editConfirmEntity({ name: null, sub: 'EMP-1' }), { name: '—', sub: 'EMP-1' });
});
