// UAT AST-01-04: a chosen model moved to another brand while the register form is open is dropped with "ยี่ห้อถูกเปลี่ยนเป็น <ยี่ห้อ> จากที่อื่น …".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { asset as th } from '../../resources/js/lang/th/asset.ts';

const drawer = readFileSync(join(import.meta.dirname, '../../resources/js/modules/asset/components/asset-form-drawer.tsx'), 'utf8');

test('registering: a reloaded model list that puts the chosen model under another brand drops it and keeps that brand for the note', () => {
    assert.match(drawer, /if \(editing \|\| !form\.model_id \|\| !form\.brand_id\) return;/);
    assert.match(
        drawer,
        /if \(chosen\?\.brand_id != null && String\(chosen\.brand_id\) !== form\.brand_id\) \{\s*setForm\(\(f\) => \(\{ \.\.\.f, model_id: '' \}\)\);\s*setModelGone\(\{ id: String\(chosen\.id\), brandId: String\(chosen\.brand_id\) \}\);/,
    );
    assert.match(drawer, /\}, \[models\]\);/);
});

test('a save refused as model_moved drops the model the same way', () => {
    assert.match(drawer, /if \(fieldError\(error, 'model_id'\) === 'model_moved'\) \{/);
    assert.match(drawer, /await modelsQuery\.refetch\(\)/);
});

test("the note names the brand the model went to, and the words are the book's", () => {
    assert.match(drawer, /brands\.find\(\(b\) => String\(b\.id\) === modelGone\.brandId\)\?\.name/);
    assert.equal(th.asset_model_gone, 'ยี่ห้อถูกเปลี่ยนเป็น {brand} จากที่อื่น เอารุ่น {model} ที่เลือกไว้ออกแล้ว เลือกรุ่นใหม่');
});
