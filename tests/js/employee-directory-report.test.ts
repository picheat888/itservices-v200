// "รายชื่อพนักงาน" report: which rows carry the Thai name note, and which columns the PDF prints when a column that draws others is hidden.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pdfColumnKeys } from '../../resources/js/modules/report/lib/inner-columns.ts';
import { thaiNameNote } from '../../resources/js/modules/report/lib/thai-name-note.ts';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');

test('an active employee with no Thai name, or only half of one, gets the note', () => {
    assert.equal(thaiNameNote({ status: 'active', name_th: null, _thai_name_missing: true }), 'missing');
    assert.equal(thaiNameNote({ status: 'active', name_th: 'สมชาย', _thai_name_missing: true }), 'incomplete');
    assert.equal(thaiNameNote({ status: 'active', name_th: 'สมชาย ใจดี', _thai_name_missing: false }), null);
});

test('a resigned employee never gets the note, as the tile counts active staff only', () => {
    assert.equal(thaiNameNote({ status: 'resigned', name_th: null, _thai_name_missing: true }), null);
    assert.equal(thaiNameNote({ status: 'resigned', name_th: 'สมชาย', _thai_name_missing: true }), null);
});

test('hiding a column drops the columns drawn inside it from the PDF', () => {
    const hosts = { phone: 'email', section: 'department' };
    assert.deepEqual(pdfColumnKeys(['code', 'section', 'department', 'phone'], ['email'], hosts), ['code', 'section', 'department']);
    assert.deepEqual(pdfColumnKeys(['code', 'section', 'email', 'phone'], ['department'], hosts), ['code', 'email', 'phone']);
});

test('an inner column with no host named stays in the PDF', () => {
    assert.deepEqual(pdfColumnKeys(['subject', 'ticket_no'], ['status'], {}), ['subject', 'ticket_no']);
});

test('the page names each inner column host, and the export note counts the columns on screen', () => {
    assert.match(read('modules/report/pages/employees-directory.tsx'), /const INNER_HOSTS = \{ section: 'department', phone: 'email' \};/);
    const view = read('modules/report/components/tabular-report-view.tsx');
    assert.match(view, /pdfColumnKeys\(\s*visibleColumns\.map\(\(c\) => c\.key\),\s*hidden,\s*extras\.innerHosts \?\? \{\},?\s*\)/);
    assert.match(view, /t\('rep_export_columns_note'\)\.replace\('\{n\}', fmtN\(drawnColumns\.length\)\)/);
});

test('a section option shows its department in the reader language', () => {
    assert.match(
        read('modules/report/components/tabular-filter-bar.tsx'),
        /hint: \(lang === 'th' \? o\.hint_th \|\| o\.hint : o\.hint\) \?\? undefined,/,
    );
});
