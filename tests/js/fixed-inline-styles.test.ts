// UI-13: fixed sizes live in Tailwind classes; inline style keeps only data-driven values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

test('dialog-portal menu of SearchableSelect uses classes for its fixed box', () => {
    const src = read('shared/components/searchable-select.tsx');
    assert.doesNotMatch(src, /position: 'absolute'|maxWidth: 320|width: 'max-content'|zIndex: 50/);
    assert.equal(src.match(/absolute z-50 w-max max-w-\[320px\]/g)?.length, 2);
    assert.match(src, /left: coords\.left/);
});

test('month bar keeps its 3px floor as a class and its height inline', () => {
    const src = read('shared/components/month-bar-chart.tsx');
    assert.doesNotMatch(src, /minHeight/);
    assert.match(src, /min-h-\[3px\]/);
    assert.match(src, /style=\{\{ height: `\$\{\(d\.count \/ max\) \* 100\}%` \}\}/);
});

test('org NodeAvatar takes a size variant with the same px box and initials size', () => {
    const src = read('modules/employee/components/employee-view-drawer.tsx');
    assert.doesNotMatch(src, /style=\{\{ width: size, height: size \}\}|fontSize: size/);
    assert.match(src, /sm: \{ box: 'size-\[20px\]', text: 'text-\[7\.2px\]' \}/);
    assert.match(src, /md: \{ box: 'size-\[32px\]', text: 'text-\[11\.52px\]' \}/);
    assert.match(src, /lg: \{ box: 'size-\[42px\]', text: 'text-\[15\.12px\]' \}/);
    assert.doesNotMatch(src, /<NodeAvatar [^>]*size=\{\d+\}/);
});
