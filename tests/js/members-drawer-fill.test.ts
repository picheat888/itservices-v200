// Access member list fills the fixed-height detail dialog: rows per page follow the space, so no gap is left under the pager.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const drawer = readFileSync(join(import.meta.dirname, '../../resources/js/modules/access/components/members-drawer.tsx'), 'utf8');

test('the member table sizes its pages to the space instead of a fixed 7 rows', () => {
    assert.match(drawer, /<DataTable[\s\S]*?fillHeight[\s\S]*?rowHeight=\{49\}/);
    assert.doesNotMatch(drawer, /pageSize=\{7\}/);
});

test('the members section hands the table a definite height and no longer scrolls itself', () => {
    assert.match(
        drawer,
        /\{\/\* Members — fills the rest of the dialog \*\/\}\s*<div className="border-border flex min-h-0 flex-1 flex-col overflow-hidden border-t px-6 py-4">/,
    );
    assert.match(drawer, /<div className="flex min-h-0 flex-1 flex-col">\s*<DataTable/);
});
