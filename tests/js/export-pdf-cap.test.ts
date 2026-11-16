// UAT RPT-26-03: the export dialog names the PDF's 1,000 rows as the first in the report's order, as the PDF heading does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repo = join(import.meta.dirname, '../..');
const read = (rel: string) => readFileSync(join(repo, rel), 'utf8');

test('the dialog note says first rows in the report order, in both languages', () => {
    assert.match(read('resources/js/lang/th/report.ts'), /rep_export_pdf_cap: 'PDF แสดง \{n\} รายการแรกตามลำดับในรายงาน ไฟล์ Excel มีครบทุกรายการ',/);
    assert.match(
        read('resources/js/lang/en/report.ts'),
        /rep_export_pdf_cap: "The PDF shows the first \{n\} rows in the report's order\. Excel has all of them\.",/,
    );
});

test('the tabular PDF keeps the first rows of the report order and says so', () => {
    assert.match(read('app/Services/Report/Tabular/TabularReportExporter.php'), /\$rows = \(clone \$query\)->limit\(self::PDF_ROW_LIMIT\)->get\(\);/);
    assert.match(read('resources/views/pdf/reports/tabular.blade.php'), /รายการแรกจาก/);
});
