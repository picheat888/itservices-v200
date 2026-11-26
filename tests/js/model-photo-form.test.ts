// Master Data model form: attach, crop and remove the model photo; the models list thumbnail; the quiet logo remove button.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { settings as en } from '../../resources/js/lang/en/settings.ts';
import { settings as th } from '../../resources/js/lang/th/settings.ts';

const read = (path: string) => readFileSync(join(import.meta.dirname, '../../resources/js', path), 'utf8');
const modal = read('modules/settings/components/model-modal.tsx');
const api = read('modules/settings/api/masterDataApi.ts');
const picker = read('modules/settings/components/model-photo-picker.tsx');
const page = read('modules/settings/pages/index.tsx');
const logo = read('modules/access/components/logo-picker.tsx');

test('the form checks type and 10MB, then crops as a product under Master Data', () => {
    assert.match(modal, /10 \* 1024 \* 1024/);
    assert.match(modal, /\['image\/png', 'image\/jpeg', 'image\/webp'\]/);
    assert.match(modal, /<PhotoCropDialog[\s\S]*?variant="product"[\s\S]*?eyebrow=\{t\('set_master_data'\)\}/);
});

test('a photo change makes the form dirty and goes out as photo or remove_photo', () => {
    assert.match(modal, /photoFile !== null \|\| removePhoto/);
    assert.match(modal, /remove_photo: true/);
});

test('an edit with a file goes multipart as PUT', () => {
    assert.match(api, /hasFile\(/);
    assert.match(api, /_method: 'PUT'/);
});

test('the picker has no camera badge and a quiet remove button', () => {
    assert.doesNotMatch(picker, /Camera/);
    assert.match(picker, /h-\[22px\] w-\[22px\]/);
    assert.doesNotMatch(picker, /bg-destructive/);
    assert.match(picker, /accept="image\/png,image\/jpeg,image\/webp"/);
});

test('the models list shows a 32px tile and a dashed one when there is no photo', () => {
    assert.match(page, /<ModelPhoto[^>]*size=\{32\}/);
    assert.match(page, /border-dashed/);
});

test('the logo picker with a logo has no camera badge, a quiet X and the tap caption', () => {
    assert.match(logo, /\{!preview && \(\s*<span[^>]*>\s*<Camera/);
    assert.doesNotMatch(logo, /bg-destructive/);
    assert.match(logo, /preview \? t\('photo_tap_to_change'\) : t\('access_logo_note'\)/);
});

test('Thai words match the mockup', () => {
    assert.equal(th.md_photo_note, 'PNG, JPG, WebP\nไม่เกิน 10MB');
    assert.equal(th.md_photo_shared_hint, 'ทรัพย์สินทุกชิ้นของรุ่นนี้ใช้รูปนี้ ไม่ต้องแนบที่ทรัพย์สินทีละชิ้น');
    assert.equal(th.md_photo_add, 'เพิ่มรูป');
    assert.ok(en.md_photo_note && en.md_photo_shared_hint && en.md_photo_err_size);
});
