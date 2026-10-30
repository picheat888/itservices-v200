// Touch screens get 40px priority pills and requester asset chips; mouse layouts keep their size.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js/modules/ticket/components');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

test('priority pill has 40px touch padding', () => {
    const src = read('priority-picker.tsx');
    assert.match(src, /touch:px-4/);
    assert.match(src, /touch:py-2\.5/);
});

test('requester asset chip has 40px touch padding and text', () => {
    const src = read('take-case-modal.tsx');
    assert.match(src, /touch:px-3\.5/);
    assert.match(src, /touch:py-2\.5/);
    assert.match(src, /touch:text-sm/);
});
