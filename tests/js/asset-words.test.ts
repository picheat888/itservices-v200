// Thai asset words say ทรัพย์สิน, the module's own word, never สินทรัพย์.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asset } from '../../resources/js/lang/th/asset.ts';

test('the recall dialog title uses the module word', () => {
    assert.equal(asset.asset_recall_title, 'เรียกคืนทรัพย์สิน');
});

test('no Thai asset word says สินทรัพย์', () => {
    const off = Object.entries(asset).filter(([, words]) => String(words).includes('สินทรัพย์'));
    assert.deepEqual(off, []);
});
