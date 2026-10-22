// Model selects follow their brand: only that brand's models, none before a brand is chosen, and "ยี่ห้อ" for a product brand.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { modelsForBrand } from '../../resources/js/shared/lib/brand-models.ts';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const models = [
    { id: 1, brand_id: 10, name: 'A' },
    { id: 2, brand_id: 20, name: 'B' },
    { id: 3, brand_id: 10, name: 'C' },
    { id: 4, brand_id: null, name: 'D' },
];

test('a chosen brand offers only its own models', () => {
    assert.deepEqual(
        modelsForBrand(models, 10, null).map((m) => m.id),
        [1, 3],
    );
});

test('no brand offers no models', () => {
    assert.deepEqual(modelsForBrand(models, null, null), []);
});

test('a saved model without a brand still shows its name', () => {
    assert.deepEqual(
        modelsForBrand(models, null, 2).map((m) => m.id),
        [2],
    );
});

test('the asset and stock forms keep the model select shut until a brand is chosen', () => {
    for (const file of ['modules/asset/components/asset-form-drawer.tsx', 'modules/stock/components/stock-item-modal.tsx']) {
        const src = read(file);
        assert.ok(src.includes('modelsForBrand('), file);
        assert.ok(src.includes('disabled={!selectedBrand}'), file);
    }
});

test('a product brand is called ยี่ห้อ, never แบรนด์', () => {
    assert.ok(!read('lang/th/asset.ts').includes('แบรนด์'));
    assert.ok(!read('lang/th/ticket.ts').includes('แบรนด์'));
    assert.ok(!read('lang/th/access.ts').includes('แบรนด์'));
    for (const lang of ['th', 'en']) {
        assert.ok(read(`lang/${lang}/asset.ts`).includes('asset_pick_brand_first:'), lang);
        assert.ok(read(`lang/${lang}/stock.ts`).includes('stock_pick_brand_first:'), lang);
    }
});
