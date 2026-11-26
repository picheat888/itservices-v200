// Review fixes for model photos: chip pick shows the preview, honest upload errors, iPad Safari output, no blank large view, no all-white crop.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { settings as th } from '../../resources/js/lang/th/settings.ts';
import { fallbackType, photoFileName } from '../../resources/js/modules/employee/lib/crop-math.ts';

const read = (path: string) => readFileSync(join(import.meta.dirname, '../../resources/js', path), 'utf8');
const takeCase = read('modules/ticket/components/take-case-modal.tsx');
const modal = read('modules/settings/components/model-modal.tsx');
const crop = read('modules/employee/components/photo-crop-dialog.tsx');
const lightbox = read('shared/components/model-photo-lightbox.tsx');

test('tapping a requester chip picks the asset the same way the dropdown does, so the preview shows', () => {
    assert.match(takeCase, /onClick=\{\(\) => pickAsset\(selected \? '' : String\(a\.id\)\)\}/);
    assert.doesNotMatch(takeCase, /onClick=\{\(\) => setAssetId\(/);
});

test('a photo the server refuses says the upload failed, not that the type is wrong', () => {
    assert.match(modal, /hasFieldError\(err, 'photo'\)\) \{\s*setPhotoError\(t\('md_photo_err_upload'\)\)/);
    assert.equal(th.md_photo_err_upload, 'อัปโหลดรูปไม่สำเร็จ ลองครอปใหม่หรือเลือกรูปอื่น');
});

test('a product photo falls back to JPEG when the browser cannot write WebP, and the file is named by its real type', () => {
    assert.equal(fallbackType(true, 'image/png'), 'image/jpeg');
    assert.equal(fallbackType(true, 'image/webp'), null);
    assert.equal(fallbackType(false, 'image/png'), null);
    assert.equal(photoFileName('image/jpeg'), 'photo.jpg');
    assert.equal(photoFileName('image/webp'), 'photo.webp');
    assert.equal(photoFileName('image/png'), 'photo.png');
    assert.match(crop, /fallbackType\(product, /);
    assert.match(crop, /photoFileName\(/);
    assert.doesNotMatch(crop, /new File\(\[blob\], 'photo\.webp'/);
});

test('the large view never paints empty or the previous photo while it opens', () => {
    assert.match(lightbox, /const view = photo \?\? shown;/);
    assert.doesNotMatch(lightbox, /shown\?\.model|shown\.src/);
});

test('the large view shows the whole square photo, never cut by its frame', () => {
    assert.match(lightbox, /relative aspect-square/);
    assert.match(lightbox, /absolute inset-0 h-full w-full object-contain/);
    assert.doesNotMatch(lightbox, /aspect-\[4\/3\]/);
});

test('the product crop measures again once the open animation ends, so a wide picture is never cut', () => {
    assert.match(crop, /onAnimationEnd=\{/);
    assert.match(crop, /cropper\.computeSizes\(\)/);
    assert.match(crop, /fitWholeZoom\(cropper\.mediaSize, PRODUCT_FRAME\)/);
});

test('a product crop dragged fully off the picture cannot be applied', () => {
    assert.match(crop, /const offPicture = /);
    assert.match(crop, /disabled=\{applying \|\| !croppedPixels \|\| offPicture\}/);
});
