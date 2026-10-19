// Settings → Security: the device-limit save asks first only when the limit turns on or goes lower.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsTrimConfirm } from '../../resources/js/modules/settings/lib/device-limit.ts';

test('turning the limit on asks first', () => {
    assert.equal(needsTrimConfirm(0, 2), true);
});

test('lowering the limit asks first', () => {
    assert.equal(needsTrimConfirm(3, 2), true);
});

test('raising the limit saves straight away', () => {
    assert.equal(needsTrimConfirm(2, 3), false);
});

test('an unchanged limit saves straight away', () => {
    assert.equal(needsTrimConfirm(2, 2), false);
});

test('turning the limit off saves straight away', () => {
    assert.equal(needsTrimConfirm(2, 0), false);
});

test('an unchanged off limit saves straight away', () => {
    assert.equal(needsTrimConfirm(0, 0), false);
});
