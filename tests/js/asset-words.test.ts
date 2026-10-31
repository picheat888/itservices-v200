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

test('the activity chart empty words follow the chosen period, not a fixed 12 months', async () => {
    const { asset: en } = await import('../../resources/js/lang/en/asset.ts');
    for (const words of [asset, en]) {
        const empty = Object.entries(words).filter(([key]) => key.startsWith('asset_empty_activity_'));
        assert.equal(empty.length, 4);
        assert.deepEqual(empty.filter(([, text]) => /12/.test(String(text))), []);
    }
    assert.equal(asset.asset_empty_activity_handover, 'ยังไม่มีการส่งมอบในช่วงที่เลือก');
});
