// Icon picker: the icon list floats over the dialog like the date and colour pickers, instead of opening inside the scrolling dialog body.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const picker = readFileSync(new URL('../../resources/js/shared/components/icon-picker.tsx', import.meta.url), 'utf8');

test('the icon list is a shared Popover portaled into the nearest dialog', () => {
    assert.match(picker, /from '@\/shared\/ui\/popover'/);
    assert.match(picker, /closest\('\[role="dialog"\]'\)/);
    assert.match(picker, /<PopoverContent\s[^>]*container=\{container\}/);
});

test('the icon list is as wide as its trigger', () => {
    assert.match(picker, /w-\[var\(--radix-popover-trigger-width\)\]/);
});

test('Escape closes the icon list before the dialog sees it', () => {
    assert.match(picker, /window\.addEventListener\('keydown', onKeyDown, true\)/);
    assert.match(picker, /e\.stopImmediatePropagation\(\);\s*setOpen\(false\);/);
});

test('no hand-made backdrop or in-flow absolute panel is left', () => {
    assert.doesNotMatch(picker, /fixed inset-0/);
    assert.doesNotMatch(picker, /absolute z-50 mt-1/);
});
