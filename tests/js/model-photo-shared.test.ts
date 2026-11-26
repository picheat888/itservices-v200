// Model photo tile and large view shared by every screen that shows a model's photo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { common as en } from '../../resources/js/lang/en/common.ts';
import { common as th } from '../../resources/js/lang/th/common.ts';

const read = (path: string) => readFileSync(join(import.meta.dirname, '../../resources/js', path), 'utf8');
const tile = read('shared/components/model-photo.tsx');
const lightbox = read('shared/components/model-photo-lightbox.tsx');
const header = read('shared/components/dialog-header.tsx');

test('the tile falls back to its icon when there is no photo or it fails to load', () => {
    assert.match(tile, /onError=\{/);
    assert.match(tile, /!src \|\| failed/);
});

test('the tile stays white in dark mode and shows the whole picture', () => {
    assert.match(tile, /bg-white/);
    assert.match(tile, /object-contain/);
    assert.doesNotMatch(tile, /dark:bg-/);
    assert.match(tile, /loading="lazy"/);
});

test('only the 56 and 72 tiles get the expand badge, and only the 20 tile is round', () => {
    assert.match(tile, /size === 56 \|\| size === 72/);
    assert.match(tile, /20: 'rounded-full'/);
});

test('the lightbox hides the brand line when the model has none', () => {
    assert.match(lightbox, /\{shown\?\.brand && /);
    assert.equal(th.model_photo_sample_note, 'รูปตัวอย่างของรุ่นนี้ เครื่องจริงอาจต่างกันเล็กน้อย');
    assert.equal(th.photo_tap_to_change, 'แตะรูปเพื่อเปลี่ยน');
    assert.equal(th.model_photo_view, 'ดูรูปใหญ่');
    assert.ok(en.model_photo_sample_note && en.photo_tap_to_change && en.model_photo_view);
});

test('the header takes a media node in place of its icon', () => {
    assert.match(header, /media\?: React\.ReactNode/);
    assert.match(header, /\{media \?\?\s*\(/);
});
