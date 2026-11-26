// Crop dialog product mode: a model photo opens whole in a square frame and saves with white bands, never cut.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { clipToImage, fitWholeZoom } from '../../resources/js/modules/employee/lib/crop-math.ts';

const read = (path: string) => readFileSync(join(import.meta.dirname, '../../resources/js', path), 'utf8');
const dialog = read('modules/employee/components/photo-crop-dialog.tsx');
const resourceModal = read('modules/access/components/resource-modal.tsx');

test('a wide picture opens whole inside the frame', () => {
    assert.equal(fitWholeZoom({ width: 384, height: 132 }, 224).toFixed(4), (224 / 384).toFixed(4));
    assert.equal(fitWholeZoom({ width: 200, height: 288 }, 224).toFixed(4), (224 / 288).toFixed(4));
});

test('a whole-picture square keeps the picture and leaves white bands', () => {
    const r = clipToImage({ x: 0, y: -100, width: 300, height: 300 }, { width: 300, height: 100 }, 800)!;
    assert.deepEqual([r.sx, r.sy, r.sw, r.sh], [0, 0, 300, 100]);
    assert.equal(Math.round(r.dy), 267);
    assert.equal(Math.round(r.dh), 267);
    assert.deepEqual([r.dx, r.dw], [0, 800]);
});

test('a crop inside the picture fills the canvas', () => {
    assert.deepEqual(clipToImage({ x: 10, y: 10, width: 50, height: 50 }, { width: 100, height: 100 }, 800), {
        sx: 10,
        sy: 10,
        sw: 50,
        sh: 50,
        dx: 0,
        dy: 0,
        dw: 800,
        dh: 800,
    });
});

test('a crop off the picture draws nothing', () => {
    assert.equal(clipToImage({ x: 200, y: 0, width: 50, height: 50 }, { width: 100, height: 100 }, 800), null);
});

test('the avatar crop is unchanged and the product one is square, white and 800px', () => {
    assert.match(dialog, /variant = 'avatar'/);
    assert.match(dialog, /cropShape=\{product \? 'rect' : 'round'\}/);
    assert.match(dialog, /product \? 800 : 512/);
    assert.match(dialog, /fillStyle = '#ffffff'/);
    assert.match(dialog, /eyebrow \?\? t\('employees'\)/);
    assert.match(resourceModal, /<PhotoCropDialog[\s\S]*?eyebrow=/);
});
