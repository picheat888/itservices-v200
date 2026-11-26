// Model photos on the stock item detail, the new stock request and the stock request detail; none in the items table.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (path: string) => readFileSync(join(import.meta.dirname, '../../resources/js', path), 'utf8');
const detail = read('modules/stock/components/stock-item-detail-modal.tsx');
const drawer = read('modules/stock/components/request-drawer.tsx');
const requestDetail = read('modules/stock/components/request-detail-dialog.tsx');
const stockPage = read('modules/stock/pages/index.tsx');

test('stock detail, new request and request detail show the photo', () => {
    assert.match(detail, /media=\{[\s\S]*?<ModelPhoto[^>]*size=\{56\}/);
    assert.match(drawer, /<ModelPhoto[^>]*size=\{72\}/);
    assert.match(requestDetail, /request\.model_photo_url && \(/);
    assert.match(requestDetail, /<ModelPhoto[^>]*size=\{40\}/);
    for (const src of [detail, drawer, requestDetail]) assert.match(src, /<ModelPhotoLightbox/);
});

test('the stock items table shows no photo', () => {
    assert.doesNotMatch(stockPage, /ModelPhoto/);
});
