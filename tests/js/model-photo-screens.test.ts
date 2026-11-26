// Model photos on the asset detail, take case, case detail, my assets and employee assets screens.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (path: string) => readFileSync(join(import.meta.dirname, '../../resources/js', path), 'utf8');
const assetDrawer = read('modules/asset/components/asset-detail-drawer.tsx');
const takeCase = read('modules/ticket/components/take-case-modal.tsx');
const ticketDrawer = read('modules/ticket/components/ticket-detail-drawer.tsx');
const myAssets = read('modules/profile/components/my-assets-tab.tsx');
const employeePanes = read('modules/employee/components/employee-panes.tsx');
const assetListPage = read('modules/asset/pages/index.tsx');

test('each screen uses the tile at its size', () => {
    assert.match(assetDrawer, /media=\{[\s\S]*?<ModelPhoto[^>]*size=\{56\}/);
    assert.match(takeCase, /<ModelPhoto[^>]*size=\{20\}/);
    assert.match(takeCase, /<ModelPhoto[^>]*size=\{72\}/);
    assert.match(ticketDrawer, /<ModelPhoto[^>]*size=\{56\}/);
    assert.equal((myAssets.match(/<ModelPhoto[^>]*size=\{40\}/g) ?? []).length, 2);
    assert.match(employeePanes, /<ModelPhoto[^>]*size=\{32\}/);
});

test('the large view opens where the spec says and not in the employee table', () => {
    for (const src of [assetDrawer, takeCase, ticketDrawer, myAssets]) assert.match(src, /<ModelPhotoLightbox/);
    assert.doesNotMatch(employeePanes, /onOpen=/);
});

test('the asset inventory list shows no photo', () => {
    assert.doesNotMatch(assetListPage, /ModelPhoto/);
});
