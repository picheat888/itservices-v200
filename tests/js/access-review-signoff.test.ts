// UAT RPT-23-01: the review sheet preview signs off like the PDF: owner (where there is one), reviewer and IT.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const cards = readFileSync(join(import.meta.dirname, '../../resources/js/modules/report/components/access-members-cards.tsx'), 'utf8');

test('three sign-off boxes where the resource has an owner, two otherwise', () => {
    assert.match(cards, /ownable \? 'grid-cols-3' : 'grid-cols-2'/);
    assert.match(
        cards,
        /\[\.\.\.\(ownable \? \[t\('rep_ar_sheet_sign_owner'\)\] : \[\]\), t\('rep_ar_sheet_sign_reviewer'\), t\('rep_ar_sheet_sign_it'\)\]/,
    );
});
