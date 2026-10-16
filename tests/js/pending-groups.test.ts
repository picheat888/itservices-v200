// The Dashboard strip groups the assets waiting for acceptance by model.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupPendingAssets } from '../../resources/js/modules/dashboard/lib/pending-groups.ts';

const rows = [
    { id: 1, asset_code: 'A-1', tag: null, model: 'Catalyst 9200L', category: 'Switch', category_th: 'สวิตช์' },
    { id: 2, asset_code: 'A-2', tag: null, model: 'Latitude 5440', category: 'Laptop', category_th: 'โน้ตบุ๊ก' },
    { id: 3, asset_code: 'A-3', tag: null, model: 'Catalyst 9200L', category: 'Switch', category_th: 'สวิตช์' },
    { id: 4, asset_code: 'A-4', tag: null, model: null, category: null, category_th: null },
];

test('groups by model, biggest group first then first-seen order, with the category in the chosen language', () => {
    assert.deepEqual(groupPendingAssets(rows, 'th'), [
        { key: 'Catalyst 9200L', model: 'Catalyst 9200L', type: 'สวิตช์', count: 2 },
        { key: 'Latitude 5440', model: 'Latitude 5440', type: 'โน้ตบุ๊ก', count: 1 },
        { key: 'A-4', model: 'A-4', type: null, count: 1 },
    ]);
});

test('english falls back to the english category name', () => {
    assert.equal(groupPendingAssets(rows, 'en')[0].type, 'Switch');
});

test('thai falls back to the english name when no thai name is stored', () => {
    const mixed = [{ id: 9, asset_code: 'B-1', tag: null, model: 'MX Keys', category: 'Keyboard', category_th: null }];
    assert.equal(groupPendingAssets(mixed, 'th')[0].type, 'Keyboard');
});

test('an empty list gives no groups', () => {
    assert.deepEqual(groupPendingAssets([], 'th'), []);
});
