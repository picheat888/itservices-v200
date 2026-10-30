// The asset status colour swatches grow on touch screens so a finger lands on one colour (SET-16).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync('resources/js/modules/settings/pages/index.tsx', 'utf8');

test('swatches are 36px with 8px between on touch, 28px with 6px elsewhere', () => {
    assert.match(page, /touch:gap-2 flex gap-1\.5">\s*\{ASSET_STATUS_PALETTE\.map/);
    assert.match(page, /touch:h-9 touch:w-9 block h-7 w-7 cursor-pointer rounded-full/);
});
