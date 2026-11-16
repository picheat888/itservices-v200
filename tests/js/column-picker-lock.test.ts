// UAT RPT-12-02, 22-02, 23-02, 24-02: the column picker locks only the last ticked column of its own list.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const picker = readFileSync(join(import.meta.dirname, '../../resources/js/modules/report/components/column-picker.tsx'), 'utf8');

test('the lock counts the ticked columns in the picker, not every hidden key', () => {
    assert.match(picker, /const shownCount = definition\.columns\.filter\(\(c\) => !hidden\.includes\(c\.key\)\)\.length;/);
    assert.match(picker, /const lastVisible = shownCount <= 1;/);
    assert.doesNotMatch(picker, /hidden\.length \+ 1 >= definition\.columns\.length/);
});

test('only a ticked column can be locked', () => {
    assert.match(picker, /const locked = shown && lastVisible;/);
});
