// Asset import dialog logic: steps, row edits, local checks, dropdown options, summary groups and the run payload.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { CheckedRow, ImportOptions, Issue } from '../../resources/js/modules/asset/api/assetImportApi.ts';
import { fillWords } from '../../resources/js/modules/asset/lib/fill-words.ts';
import { IMPORT_COLUMNS } from '../../resources/js/modules/asset/lib/import-columns.ts';
import {
    badRowCount,
    fillIssueWords,
    foldAt,
    importRunPayload,
    localIssues,
    normalizeDate,
    optionsFor,
    overlayFromRefusal,
    rowsWithEdits,
    summaryGroups,
    withServerIssues,
} from '../../resources/js/modules/asset/lib/import-rows.ts';
import { canLeaveStep, importSteps, stepAfterRefusal } from '../../resources/js/modules/asset/lib/import-wizard.ts';
import type { DateFormat } from '../../resources/js/shared/lib/datetime.ts';

const options: ImportOptions = {
    categories: [{ id: 1, name: 'Notebook', name_th: 'โน้ตบุ๊ก' }],
    brands: [
        { id: 10, name: 'Lenovo' },
        { id: 11, name: 'Dell' },
    ],
    models: [
        { id: 100, name: 'ThinkPad E14', brand_id: 10 },
        { id: 101, name: 'Latitude 5440', brand_id: 11 },
    ],
    warehouses: [
        { id: 5, name: 'Main', name_th: 'คลังกลาง' },
        { id: 6, name: 'Branch' },
    ],
    vendors: [{ id: 7, name: 'IT City' }],
};

function row(line: number, over: Partial<CheckedRow['values']> = {}, issues: Issue[] = []): CheckedRow {
    return {
        line,
        cells: {},
        values: {
            category_id: 1,
            brand_id: 10,
            model_id: 100,
            warehouse_id: 5,
            vendor_id: 7,
            serial: `SN${line}`,
            asset_code: null,
            tag: null,
            notes: null,
            value: '28500.00',
            purchase_date: '2026-11-12',
            warranty_end: '2029-11-11',
            warranty_lifetime: false,
            ...over,
        },
        issues,
    };
}

test('rented has five steps and purchased four', () => {
    assert.deepEqual(importSteps('rented'), ['kind', 'upload', 'check', 'contract', 'summary']);
    assert.deepEqual(importSteps('purchased'), ['kind', 'upload', 'check', 'summary']);
});

test('the next button needs a file, then clean rows, then a contract when linking', () => {
    const clean = [row(2)];
    const bad = [row(2, {}, [{ code: 'required', column: 'serial' }])];
    const base = { kind: 'rented' as const, file: null, rows: [], linkContract: false, contractId: null };
    assert.equal(canLeaveStep('kind', { ...base, kind: null }), false);
    assert.equal(canLeaveStep('kind', base), true);
    assert.equal(canLeaveStep('upload', base), false);
    assert.equal(canLeaveStep('upload', { ...base, file: new File([], 'a.xlsx'), rows: clean }), true);
    assert.equal(canLeaveStep('check', { ...base, rows: bad }), false);
    assert.equal(canLeaveStep('check', { ...base, rows: [] }), false);
    assert.equal(canLeaveStep('check', { ...base, rows: clean }), true);
    assert.equal(canLeaveStep('contract', { ...base, rows: clean, linkContract: true, contractId: null }), false);
    assert.equal(canLeaveStep('contract', { ...base, rows: clean, linkContract: true, contractId: 9 }), true);
    assert.equal(canLeaveStep('contract', { ...base, rows: clean, linkContract: false }), true);
});

test('fixing a cell clears its issue and the bad-row count follows', () => {
    const rows = [row(2, { serial: null }, [{ code: 'required', column: 'serial' }]), row(3, {}, [{ code: 'not_found', column: 'brand' }]), row(4)];
    assert.equal(badRowCount(rows), 2);
    const fixed = rowsWithEdits(rows, { 2: { serial: 'ABC123' } }, options, 'purchased', 'dmy_slash');
    assert.equal(fixed[0].values.serial, 'ABC123');
    assert.deepEqual(fixed[0].issues, []);
    assert.equal(badRowCount(fixed), 1);
    // The input rows are left untouched
    assert.equal(rows[0].values.serial, null);
    const picked = rowsWithEdits(fixed, { 3: { brand: 11, model: 101 } }, options, 'purchased', 'dmy_slash');
    assert.equal(picked[1].values.brand_id, 11);
    assert.equal(picked[1].values.model_id, 101);
    assert.equal(badRowCount(picked), 0);
    // An edit that is still wrong keeps the row bad
    const still = rowsWithEdits(rows, { 2: { serial: 'x'.repeat(121) } }, options, 'purchased', 'dmy_slash');
    assert.deepEqual(still[0].issues, [{ code: 'too_long', column: 'serial', max: 120, length: 121 }]);
});

test('a tag over 10, a repeated serial, a bad price and an impossible date are caught while typing', () => {
    const rows = [row(2, { serial: 'PF4XK101' }), row(3)];
    const ctx = { kind: 'purchased' as const, rows, options, dateFormat: 'dmy_slash' as const };
    assert.deepEqual(localIssues(rows[1], 'tag', 'ABCDEFGHIJK', ctx), [{ code: 'too_long', column: 'tag', max: 10, length: 11 }]);
    assert.deepEqual(localIssues(rows[1], 'tag', 'ABCDEFGHIJ', ctx), []);
    assert.deepEqual(localIssues(rows[1], 'serial', 'pf4xk101', ctx), [{ code: 'dup_in_file', column: 'serial', line: 2 }]);
    assert.deepEqual(localIssues(rows[0], 'serial', 'pf4xk101', ctx), []);
    assert.deepEqual(localIssues(rows[1], 'serial', '', ctx), [{ code: 'required', column: 'serial' }]);
    assert.deepEqual(localIssues(rows[1], 'value', '28,500.00', ctx), []);
    assert.deepEqual(localIssues(rows[1], 'value', '28,5OO', ctx), [{ code: 'not_a_number', column: 'value', value: '28,5OO' }]);
    assert.deepEqual(localIssues(rows[1], 'value', '1.234', ctx), [{ code: 'not_a_number', column: 'value', value: '1.234' }]);
    assert.deepEqual(localIssues(rows[1], 'purchase_date', '2026-02-31', ctx), [{ code: 'bad_date', column: 'purchase_date', value: '2026-02-31' }]);
    assert.deepEqual(localIssues(rows[1], 'purchase_date', '2026-11-12', ctx), []);
    assert.deepEqual(localIssues(rows[1], 'purchase_date', '', ctx), [{ code: 'required', column: 'purchase_date' }]);
    // Rented files have no price, so an empty price is fine there
    assert.deepEqual(localIssues(rows[1], 'value', '', { ...ctx, kind: 'rented' }), []);
    // Lifetime warranty makes the end date optional
    const lifetime = row(4, { warranty_lifetime: true });
    assert.deepEqual(localIssues(lifetime, 'warranty_end', '', { ...ctx, rows: [lifetime] }), []);
});

test('the closest name is the first dropdown option', () => {
    const list = optionsFor('brand', options, 11);
    assert.deepEqual(
        list.map((o) => o.value),
        ['11', '10'],
    );
    assert.equal(list[0].label, 'Dell');
    assert.deepEqual(
        optionsFor('brand', options).map((o) => o.value),
        ['10', '11'],
    );
    // A closest id that is not in the list changes nothing
    assert.deepEqual(
        optionsFor('brand', options, 999).map((o) => o.value),
        ['10', '11'],
    );
    assert.equal(optionsFor('category', options)[0].search.includes('โน้ตบุ๊ก'), true);
    assert.deepEqual(
        optionsFor('warehouse', options, 6).map((o) => o.value),
        ['6', '5'],
    );
});

test('the summary groups by model, by warehouse and by vendor with values, folding past five', () => {
    const rows = [row(2), row(3), row(4, { model_id: 101, brand_id: 11, warehouse_id: 6, vendor_id: null, value: '1000.50' })];
    const purchased = summaryGroups(rows, options, 'purchased');
    assert.deepEqual(purchased.byModel, [
        ['ThinkPad E14', 2, 57000],
        ['Latitude 5440', 1, 1000.5],
    ]);
    assert.deepEqual(purchased.byWarehouse, [
        ['Main', 2, 57000],
        ['Branch', 1, 1000.5],
    ]);
    assert.deepEqual(purchased.byVendor, [['IT City', 2, 57000]]);
    const rented = summaryGroups(rows, options, 'rented');
    assert.equal(rented.byVendor, undefined);
    assert.deepEqual(summaryGroups([], options, 'purchased').byModel, []);

    const seven = Array.from({ length: 7 }, (_, i) => [`m${i}`, 1, 0] as [string, number, number]);
    const folded = foldAt(seven, 5);
    assert.equal(folded.shown.length, 5);
    assert.equal(folded.rest.length, 2);
    assert.deepEqual(foldAt(seven.slice(0, 5), 5), { shown: seven.slice(0, 5), rest: [] });
    assert.deepEqual(foldAt([], 5), { shown: [], rest: [] });
});

test('a closed contract sends the user back to the contract step; a taken serial to the check step', () => {
    assert.equal(stepAfterRefusal('link_contract_not_open'), 'contract');
    assert.equal(stepAfterRefusal('import_rows_invalid'), 'check');
    assert.equal(stepAfterRefusal('import_conflict'), 'check');
    assert.equal(stepAfterRefusal('something_else'), 'summary');
});

test('the import payload carries matched ids and the contract only for rentals', () => {
    const rows = [row(2, { value: '28,500.5', asset_code: 'INK-1', warranty_lifetime: true, warranty_end: null })];
    const purchased = importRunPayload('purchased', rows, 9, 'dmy_slash');
    assert.equal('contract_id' in purchased, false);
    assert.deepEqual(purchased.rows[0], {
        line: 2,
        category_id: 1,
        brand_id: 10,
        model_id: 100,
        serial: 'SN2',
        warehouse_id: 5,
        asset_code: 'INK-1',
        tag: null,
        notes: null,
        value: '28500.50',
        vendor_id: 7,
        purchase_date: '2026-11-12',
        warranty_end: null,
        warranty_lifetime: true,
    });
    assert.equal(importRunPayload('rented', rows, 9, 'dmy_slash').contract_id, 9);
    assert.equal('contract_id' in importRunPayload('rented', rows, null, 'dmy_slash'), false);
    assert.equal(importRunPayload('rented', rows, null, 'dmy_slash').kind, 'rented');
});

test('the column lists match the template headers', () => {
    assert.deepEqual(
        IMPORT_COLUMNS.rented.map((c) => c.header),
        [
            'รหัสทรัพย์สิน (Asset No.)',
            'Tag',
            'ประเภท (Type)',
            'ยี่ห้อ (Brand)',
            'รุ่น (Model)',
            'Serial (Serial No.)',
            'คลัง (Warehouse)',
            'หมายเหตุ (Remark)',
        ],
    );
    assert.deepEqual(
        IMPORT_COLUMNS.purchased.map((c) => c.key),
        [
            'asset_code',
            'category',
            'brand',
            'model',
            'serial',
            'warehouse',
            'tag',
            'value',
            'vendor',
            'purchase_date',
            'warranty_end',
            'warranty_lifetime',
            'notes',
        ],
    );
    const serial = IMPORT_COLUMNS.rented.find((c) => c.key === 'serial');
    assert.equal(serial?.howKey, 'asset_import_how_serial');
    assert.equal(serial?.required, true);
    assert.equal(IMPORT_COLUMNS.rented.find((c) => c.key === 'brand')?.list, 'brands');
});

test('fixing the first of a duplicate pair clears the later row, and a new clash flags the later row with the earlier line', () => {
    const rows = [row(2, { serial: 'AB 1' }), row(3), row(5, { serial: 'ab 1' }, [{ code: 'dup_in_file', column: 'serial', line: 2 }])];
    // The server's flag on line 5 stays right when nothing changes for it
    const fixedOriginal = rowsWithEdits(rows, { 2: { serial: 'UNIQUE-1' } }, options, 'purchased', 'dmy_slash');
    assert.deepEqual(fixedOriginal[2].issues, []);
    assert.equal(badRowCount(fixedOriginal), 0);
    // Editing an earlier row into a clash flags the later row, not itself
    const clash = rowsWithEdits(fixedOriginal, { 2: { serial: 'sn3' } }, options, 'purchased', 'dmy_slash');
    assert.deepEqual(clash[0].issues, []);
    assert.deepEqual(clash[1].issues, [{ code: 'dup_in_file', column: 'serial', line: 2 }]);
    // Editing a later row into a clash flags that row
    const later = rowsWithEdits(fixedOriginal, { 5: { serial: 'SN3' } }, options, 'purchased', 'dmy_slash');
    assert.deepEqual(later[2].issues, [{ code: 'dup_in_file', column: 'serial', line: 3 }]);
    assert.deepEqual(later[1].issues, []);
});

test('typed dates follow the date-format setting, accept Buddhist years and refuse impossible days', () => {
    const rows = [row(2)];
    const ctx = { kind: 'purchased' as const, rows, options, dateFormat: 'dmy_slash' as const };
    const check = (text: string, dateFormat: DateFormat) => localIssues(rows[0], 'purchase_date', text, { ...ctx, dateFormat }).length;
    assert.equal(check('12/11/2026', 'dmy_slash'), 0);
    assert.equal(check('12-11-2026', 'dmy_slash'), 0);
    assert.equal(check('2026/11/12', 'dmy_slash'), 1);
    assert.equal(check('2026/11/12', 'ymd_slash'), 0);
    assert.equal(check('2026-11-12', 'ymd_slash'), 0);
    // Day-first is the template's form and no setting is month-first, so every setting reads it
    for (const format of ['dmy_slash', 'dmy_dash', 'ymd_slash', 'ymd_dash', 'd_mon_y', 'd_month_y'] as const) {
        assert.equal(normalizeDate('12/11/2026', format), '2026-11-12', format);
        assert.equal(normalizeDate('12-11-2026', format), '2026-11-12', format);
        assert.equal(normalizeDate('12/11/2569', format), '2026-11-12', format);
        assert.equal(normalizeDate('2026-11-12', format), '2026-11-12', format);
        assert.equal(normalizeDate('31/02/2026', format), null, format);
    }
    assert.equal(check('12/11/2569', 'dmy_slash'), 0);
    assert.equal(check('31/02/2026', 'dmy_slash'), 1);
    assert.equal(check('12 Nov 2026', 'd_mon_y'), 1);
    const edited = rowsWithEdits(rows, { 2: { purchase_date: '12/11/2569' } }, options, 'purchased', 'dmy_slash');
    assert.equal(edited[0].values.purchase_date, '2026-11-12');
    assert.equal(importRunPayload('purchased', edited, null, 'dmy_slash').rows[0].purchase_date, '2026-11-12');
});

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');

test('the import button sits with the register button and opens ?dialog=import', () => {
    const page = read('modules/asset/pages/index.tsx');
    assert.match(page, /t\('asset_import'\)/);
    assert.match(page, /<AssetImportDialog/);
    assert.match(page, /\{canCreate && \(\s*<>[\s\S]*t\('asset_import'\)[\s\S]*t\('register_asset'\)/);
    assert.match(read('modules/asset/components/import/asset-import-dialog.tsx'), /useDialogParam\(\[\s*'import'\s*\]/);
});

test('the dialog guards a chosen file and the stepper marks the current step', () => {
    const dialog = read('modules/asset/components/import/asset-import-dialog.tsx');
    assert.match(dialog, /useDiscardGuard\(/);
    assert.match(dialog, /focusDialogContentClass/);
    assert.match(read('modules/asset/components/import/import-stepper.tsx'), /aria-current=\{[^}]*'step'[^}]*\}/);
});

test('the kind step uses real radios in a fieldset', () => {
    assert.match(read('modules/asset/components/import/import-kind-step.tsx'), /<fieldset[\s\S]*type="radio"/);
});

test('the upload step takes one .xlsx and shows the chosen file inside the drop zone', () => {
    const up = read('modules/asset/components/import/import-upload-step.tsx');
    assert.match(up, /accept=\{\['xlsx'\]\}/);
    assert.match(up, /asset_import_one_file_only/);
    assert.match(up, /InfoPopover/);
    assert.match(up, /translate="no"/);
});

test('every column help text the import columns name exists in both languages', () => {
    const th = read('lang/th/asset.ts');
    const en = read('lang/en/asset.ts');
    for (const kind of ['rented', 'purchased'] as const) {
        for (const column of IMPORT_COLUMNS[kind]) {
            assert.ok(th.includes(`${column.howKey}:`), `th ${column.howKey}`);
            assert.ok(en.includes(`${column.howKey}:`), `en ${column.howKey}`);
        }
    }
});

test('the discard guard and the page gate only count while the dialog is open', () => {
    assert.match(read('modules/asset/components/import/asset-import-dialog.tsx'), /useDiscardGuard\(open && /);
    assert.match(read('modules/asset/pages/index.tsx'), /open=\{canCreate && importDialog\.open\}/);
});

test('the upload step words a wrong file type and a failed template download', () => {
    const up = read('modules/asset/components/import/import-upload-step.tsx');
    assert.match(up, /asset_refusal_import_unreadable/);
    assert.match(up, /import_template_failed/);
});

test('every issue code has words in both languages', () => {
    const th = read('lang/th/asset.ts');
    const en = read('lang/en/asset.ts');
    for (const code of [
        'required',
        'not_found',
        'model_not_in_brand',
        'too_long',
        'dup_in_file',
        'serial_taken',
        'code_taken',
        'not_a_number',
        'bad_date',
        'not_yes_no',
    ]) {
        assert.ok(th.includes(`asset_import_issue_${code}:`), `th ${code}`);
        assert.ok(en.includes(`asset_import_issue_${code}:`), `en ${code}`);
    }
});

test('the check step words exist in both languages', () => {
    const th = read('lang/th/asset.ts');
    const en = read('lang/en/asset.ts');
    for (const key of [
        'summary_line',
        'summary_value',
        'bad_rows',
        'show_all',
        'show_bad',
        'col_row',
        'col_result',
        'fix_column',
        'row_ready',
        'cell_fixed',
        'check_note',
        'next_blocked',
    ]) {
        assert.ok(th.includes(`asset_import_${key}:`), `th ${key}`);
        assert.ok(en.includes(`asset_import_${key}:`), `en ${key}`);
    }
});

test('the check table pins row number and result, and the result names the column to fix', () => {
    const table = read('modules/asset/components/import/import-check-table.tsx');
    assert.match(table, /<th scope="row"/);
    assert.match(table, /sticky/);
    assert.match(table, /asset_import_fix_column/);
    assert.match(table, /aria-invalid/);
    assert.match(table, /aria-describedby/);
    assert.match(table, /scrollIntoView/);
});

test('nothing is written beside the next button, whose reason is read by screen readers only', () => {
    const step = read('modules/asset/components/import/import-check-step.tsx');
    assert.doesNotMatch(step, /asset_import_rows_left/);
    assert.match(step, /asset_import_next_blocked/);
    assert.match(step, /sr-only/);
    assert.match(read('modules/asset/components/import/asset-import-dialog.tsx'), /aria-describedby=/);
});

test('the dialog renders the check step and handles the edit action', () => {
    const dialog = read('modules/asset/components/import/asset-import-dialog.tsx');
    assert.match(dialog, /ImportCheckStep/);
    assert.match(dialog, /type: 'edit'/);
});

test('issue words fill the code, brand name, line and counts', () => {
    const fmt = (n: number) => `#${n}`;
    const name = (c: string) => c;
    const r = row(4, { asset_code: 'INK-1', brand_id: 10 });
    assert.equal(
        fillIssueWords('รหัส {value} มีในระบบแล้ว', { code: 'code_taken', column: 'asset_code' }, r, options, name, fmt),
        'รหัส INK-1 มีในระบบแล้ว',
    );
    assert.equal(fillIssueWords('{brand}', { code: 'model_not_in_brand', column: 'model' }, r, options, name, fmt), 'Lenovo');
    assert.equal(fillIssueWords('{column} {line}', { code: 'dup_in_file', column: 'serial', line: 3 }, r, options, name, fmt), 'serial #3');
    assert.equal(fillIssueWords('{length}/{max}', { code: 'too_long', column: 'tag', length: 13, max: 10 }, r, options, name, fmt), '#13/#10');
});

test('rows an edit did not touch keep their identity', () => {
    const rows = [row(2), row(3), row(4, { serial: 'SN2' })];
    const result = rowsWithEdits(rows, { 3: { serial: 'X' } }, options, 'rented', 'dmy_slash');
    assert.equal(result[0], rows[0]);
    assert.notEqual(result[1], rows[1]);
    const flagged = rowsWithEdits(rows, {}, options, 'rented', 'dmy_slash');
    assert.notEqual(flagged[2], rows[2]);
    assert.equal(rowsWithEdits(flagged, {}, options, 'rented', 'dmy_slash')[2], flagged[2]);
});

test('the check table marks list cells red, keys issue lines by index and does not read live codes', () => {
    const table = read('modules/asset/components/import/import-check-table.tsx');
    assert.match(table, /\[&_\[role=combobox\]\]:border-destructive/);
    assert.doesNotMatch(table, /key=\{words\}/);
    assert.match(read('modules/asset/components/import/import-check-step.tsx'), /row\.cells\.asset_code/);
});

test('the contract step is two radios and shows the contract picker only when linking', () => {
    const step = read('modules/asset/components/import/import-contract-step.tsx');
    assert.match(step, /type="radio"[\s\S]*type="radio"/);
    assert.match(step, /asset_import_contract_hint/);
    assert.doesNotMatch(step, /asset_rented_from_contract/);
});

test('the summary button says only "นำเข้า"', () => {
    assert.match(read('lang/th/asset.ts'), /asset_import_run: 'นำเข้า'/);
    assert.match(read('modules/asset/components/import/import-summary-step.tsx'), /t\('asset_import_run'\)/);
});

test('the done screen pins the imported rows and can jump to the awaiting list', () => {
    const done = read('modules/asset/components/import/import-done.tsx');
    assert.match(done, /onShowAwaiting/);
    assert.match(read('modules/asset/hooks/use-asset-import.ts'), /markNew\('assets'/);
});

test('the contract, summary and done words exist in both languages', () => {
    const th = read('lang/th/asset.ts');
    const en = read('lang/en/asset.ts');
    for (const key of [
        'contract_heading',
        'contract_sub',
        'contract_later',
        'contract_later_desc',
        'contract_link',
        'contract_link_desc',
        'contract_field',
        'contract_hint',
        'summary_heading',
        'summary_lead',
        'summary_one_wh',
        'summary_many_wh',
        'summary_contract',
        'summary_contract_none',
        'summary_change',
        'by_model',
        'by_warehouse',
        'by_vendor',
        'count',
        'value',
        'total',
        'more',
        'run',
        'done_title_rented',
        'done_title_purchased',
        'done_codes',
        'done_waiting',
        'done_waiting_sub',
        'done_show_waiting',
        'done_linked',
        'done_show_imported',
        'done_close',
    ]) {
        assert.ok(th.includes(`asset_import_${key}:`), `th ${key}`);
        assert.ok(en.includes(`asset_import_${key}:`), `en ${key}`);
    }
    for (const code of ['import_rows_invalid', 'import_conflict']) {
        assert.ok(th.includes(`asset_refusal_${code}:`), `th ${code}`);
        assert.ok(en.includes(`asset_refusal_${code}:`), `en ${code}`);
    }
});

test('a server issue stays on its cell until the cell changes, and other rows are untouched', () => {
    const sent = row(3, { serial: 'SN-DUP' });
    const rows = [row(2), row(3, { serial: 'SN-DUP' }), row(4)];
    const overlay = { 3: { issues: [{ code: 'serial_taken', column: 'serial', asset_code: 'INK-9' }], sent: sent.values } };

    const shown = withServerIssues(rows, overlay);
    assert.deepEqual(shown[1].issues, [{ code: 'serial_taken', column: 'serial', asset_code: 'INK-9' }]);
    assert.equal(badRowCount(shown), 1);
    assert.equal(shown[0], rows[0]);
    assert.equal(shown[2], rows[2]);

    // The cell changed: the issue is gone and the row keeps its identity from the edited rows
    const edited = [row(2), row(3, { serial: 'SN-NEW' }), row(4)];
    const after = withServerIssues(edited, overlay);
    assert.equal(after[1], edited[1]);
    assert.equal(badRowCount(after), 0);

    // Another column of the same row changing does not clear it
    const other = [row(2), row(3, { serial: 'SN-DUP', tag: 'A1' }), row(4)];
    assert.equal(withServerIssues(other, overlay)[1].issues.length, 1);

    // Never added twice when the same issue is already there
    const again = withServerIssues(withServerIssues(rows, overlay), overlay);
    assert.equal(again[1].issues.length, 1);
});

test('a server issue on a list column clears when another option is picked', () => {
    const sent = row(2, { warehouse_id: 5 });
    const overlay = { 2: { issues: [{ code: 'not_found', column: 'warehouse' }], sent: sent.values } };
    assert.equal(badRowCount(withServerIssues([row(2, { warehouse_id: 5 })], overlay)), 1);
    assert.equal(badRowCount(withServerIssues([row(2, { warehouse_id: 6 })], overlay)), 0);
});

test('a refusal becomes an overlay keyed by sheet line with the values sent, skipping lines that are gone', () => {
    const rows = [row(2), row(3, { serial: 'SN-DUP' })];
    const issue = { code: 'serial_taken', column: 'serial', asset_code: 'INK-9' };
    const overlay = overlayFromRefusal(
        [
            { row: 3, issues: [issue] },
            { row: 99, issues: [issue] },
        ],
        rows,
    );
    assert.deepEqual(Object.keys(overlay), ['3']);
    assert.equal(overlay[3].sent, rows[1].values);
    assert.deepEqual(overlay[3].issues, [issue]);
});

test('only the newest 20 imported rows are pinned', () => {
    const hook = read('modules/asset/hooks/use-asset-import.ts');
    assert.match(hook, /const PIN_LIMIT = 20/);
    assert.match(hook, /markNew\('assets', \[\.\.\.result\.ids\]\.sort\(\(a, b\) => b - a\)\.slice\(0, PIN_LIMIT\)\)/);
});

test('filled words space a Latin or digit value where it meets a Thai letter, and leave the copy as written', () => {
    assert.equal(fillWords('ต้องกรอก{column}', { column: 'Serial' }), 'ต้องกรอก Serial');
    assert.equal(fillWords('{column}ยาว {length} ตัวอักษร', { column: 'Tag', length: '14' }), 'Tag ยาว 14 ตัวอักษร');
    assert.equal(fillWords('ไม่พบ{column}นี้ เลือกจากรายการ', { column: 'Serial' }), 'ไม่พบ Serial นี้ เลือกจากรายการ');
    assert.equal(fillWords('ทุกรายการเข้า{warehouse} สถานะ', { warehouse: 'IT Store' }), 'ทุกรายการเข้า IT Store สถานะ');
    assert.equal(fillWords('แถว{line}', { line: '3' }), 'แถว 3');
    // A Thai value, English copy and a value already spaced stay as they are
    assert.equal(fillWords('ต้องกรอก{column}', { column: 'ประเภท' }), 'ต้องกรอกประเภท');
    assert.equal(fillWords('Fill in {column}', { column: 'Serial' }), 'Fill in Serial');
    assert.equal(fillWords('ต้องแก้ {column}', { column: 'Serial' }), 'ต้องแก้ Serial');
    assert.equal(fillWords('เข้า{warehouse}', { warehouse: 'คลัง IT' }), 'เข้าคลัง IT');
    // A missing value is blank and the copy is never re-spaced
    assert.equal(fillWords('Serialซ้ำ{x}กับ', {}), 'Serialซ้ำกับ');
});

test('issue words are spaced around Latin column names', () => {
    const fmt = (n: number) => String(n);
    const name = (c: string) => (c === 'serial' ? 'Serial' : c === 'tag' ? 'Tag' : c);
    const r = row(4);
    assert.equal(
        fillIssueWords('{column}ซ้ำกับแถว {line} แก้ให้ไม่ซ้ำ', { code: 'dup_in_file', column: 'serial', line: 2 }, r, options, name, fmt),
        'Serial ซ้ำกับแถว 2 แก้ให้ไม่ซ้ำ',
    );
    assert.equal(fillIssueWords('ต้องกรอก{column}', { code: 'required', column: 'serial' }, r, options, name, fmt), 'ต้องกรอก Serial');
    assert.equal(
        fillIssueWords('{column}ยาว {length} ตัวอักษร', { code: 'too_long', column: 'tag', length: 14, max: 10 }, r, options, name, fmt),
        'Tag ยาว 14 ตัวอักษร',
    );
});

test('names inserted in the check, summary and upload words go through fillWords', () => {
    assert.match(read('modules/asset/components/import/import-check-table.tsx'), /fillWords\(t\('asset_import_fix_column'\)/);
    assert.match(read('modules/asset/components/import/import-summary-step.tsx'), /fillWords\(t\('asset_import_summary_one_wh'\), \{ warehouse: /);
    assert.match(read('modules/asset/components/import/import-upload-step.tsx'), /fillWords\(t\('asset_import_drop_hint'\), \{ kind: /);
});

test('the check step names the file columns it ignores, only when there are some', () => {
    const step = read('modules/asset/components/import/import-check-step.tsx');
    assert.match(step, /ignoredColumns\.length > 0 && \(/);
    assert.match(step, /t\('import_ignored_columns'\)\} <span translate="no">\{ignoredColumns\.join\(', '\)\}/);
    assert.match(read('modules/asset/components/import/asset-import-dialog.tsx'), /ignoredColumns=\{state\.preview\.meta\.ignored_columns\}/);
});

test('a list cell shows the file text until edited, and every control names its row', () => {
    const table = read('modules/asset/components/import/import-check-table.tsx');
    assert.match(table, /const typed = edited \? '' : \(row\.cells\[column\] \?\? ''\)\.trim\(\)/);
    assert.match(table, /placeholder=\{typed \|\| undefined\}/);
    assert.match(table, /`\$\{labelOf\(column\)\} \$\{t\('asset_import_col_row'\)\} \$\{fmtN\(row\.line\)\}`/);
    assert.doesNotMatch(table, /aria-label=\{label\}/);
    assert.equal((table.match(/aria-label=\{controlLabel\}/g) ?? []).length, 3);
    // The search box inside the list still names only the column
    assert.match(table, /searchPlaceholder=\{label\}/);
});

test('new-row pins fetch off-page rows only on the unfiltered list, and "show imported" clears the filters', () => {
    const page = read('modules/asset/pages/index.tsx');
    assert.match(page, /active: tab === 'inventory' && !hasActiveFilters,/);
    // Declared before the pins read it
    assert.ok(page.indexOf('const hasActiveFilters') < page.indexOf('useNewRows({'));
    assert.match(
        page,
        /const showImported = \(\) => \{\s*if \(tab === 'inventory' && !hasActiveFilters\) return;[\s\S]*?LIST_KEYS\.forEach\(\(key\) => next\.delete\(key\)\)/,
    );
    assert.match(page, /else current\.showImported\(\);/);
});

test('en says "Ready to deploy" like the status, and the awaiting label sits with the awaiting keys', () => {
    const en = read('lang/en/asset.ts');
    assert.doesNotMatch(en, /Ready to hand over/);
    for (const lang of ['th', 'en']) {
        const text = read(`lang/${lang}/asset.ts`);
        assert.match(
            text,
            /awaiting-contract label and header alert\n {4}asset_awaiting_contract: '[^']*',\n {4}asset_awaiting_contract_strip:/,
            lang,
        );
    }
    const comments = (lang: string) => read(`lang/${lang}/asset.ts`).match(/^ {4}\/\/ .*$/gm);
    assert.deepEqual(comments('th'), comments('en'));
});

test('a year before 1900 is a bad date after the Buddhist-era subtraction', () => {
    assert.equal(normalizeDate('12/11/0026', 'dmy_slash'), null);
    assert.equal(normalizeDate('1899-12-31', 'dmy_slash'), null);
    assert.equal(normalizeDate('1900-01-01', 'dmy_slash'), '1900-01-01');
    assert.equal(normalizeDate('12/11/2569', 'dmy_slash'), '2026-11-12');
    const rows = [row(2)];
    const ctx = { kind: 'purchased' as const, rows, options, dateFormat: 'dmy_slash' as const };
    assert.equal(localIssues(rows[0], 'purchase_date', '12/11/0026', ctx)[0].code, 'bad_date');
});

test('serial duplicates compare by trim and lowercase only, like the server', () => {
    const rows = [row(2, { serial: 'AB  1' }), row(3, { serial: 'ab 1' }), row(4, { serial: ' ab  1 ' })];
    const result = rowsWithEdits(rows, {}, options, 'purchased', 'dmy_slash');
    assert.deepEqual(result[1].issues, []);
    assert.deepEqual(result[2].issues, [{ code: 'dup_in_file', column: 'serial', line: 2 }]);
    const ctx = { kind: 'purchased' as const, rows, options, dateFormat: 'dmy_slash' as const };
    assert.deepEqual(localIssues(rows[1], 'serial', 'ab 1', ctx), []);
    assert.equal(localIssues(rows[1], 'serial', 'ab  1', ctx)[0].code, 'dup_in_file');
});

test('a brand-only edit that leaves the model empty makes the model required', () => {
    const rows = [row(2, { model_id: null }, [{ code: 'model_not_in_brand', column: 'model', value: 'X' }])];
    const result = rowsWithEdits(rows, { 2: { brand: 11 } }, options, 'purchased', 'dmy_slash');
    assert.deepEqual(result[0].issues, [{ code: 'required', column: 'model' }]);
});

test('editing a taken serial back to the value the server checked keeps the server issue', () => {
    const taken: Issue = { code: 'serial_taken', column: 'serial', asset_code: 'INK-1' };
    const rows = [row(2, { serial: 'SN2' }, [taken])];
    assert.deepEqual(rowsWithEdits(rows, { 2: { serial: 'SN2' } }, options, 'purchased', 'dmy_slash')[0].issues, [taken]);
    assert.deepEqual(rowsWithEdits(rows, { 2: { serial: 'sn-new' } }, options, 'purchased', 'dmy_slash')[0].issues, []);
});

test('editing a taken serial or code to a case or space variant keeps the server issue', () => {
    const taken: Issue = { code: 'serial_taken', column: 'serial', asset_code: 'INK-1' };
    const codeTaken: Issue = { code: 'code_taken', column: 'asset_code' };
    const rows = [row(2, { serial: 'SN2', asset_code: 'Code-1' }, [taken, codeTaken])];
    const same = rowsWithEdits(rows, { 2: { serial: ' sn2 ', asset_code: 'code-1' } }, options, 'purchased', 'dmy_slash');
    assert.deepEqual(same[0].issues, [taken, codeTaken]);
    const other = rowsWithEdits(rows, { 2: { serial: 'sn 2' } }, options, 'purchased', 'dmy_slash');
    assert.deepEqual(other[0].issues, [codeTaken]);
});

test('an oversize file and a missing permission have their own words, used before the generic one', () => {
    const th = read('lang/th/asset.ts');
    const en = read('lang/en/asset.ts');
    assert.match(th, /asset_refusal_import_too_large: 'ไฟล์ใหญ่เกิน 5 MB'/);
    assert.match(en, /asset_refusal_import_too_large: 'The file is over 5 MB'/);
    assert.match(th, /asset_import_forbidden: 'คุณไม่มีสิทธิ์นำเข้าทรัพย์สิน'/);
    assert.match(en, /asset_import_forbidden: 'You do not have permission to import assets'/);
    const dialog = read('modules/asset/components/import/asset-import-dialog.tsx');
    assert.match(dialog, /file\.size > MAX_FILE_BYTES[\s\S]*previewFile\.mutate/);
    assert.match(dialog, /httpStatus\(error\) === 413/);
    assert.equal(dialog.match(/asset_import_forbidden/g)?.length, 2);
    assert.match(th, /asset_import_example_notes: 'ล็อตปี 2026'/);
});

test('examples worded per language come from the lang files; the rest read the same in both', () => {
    const th = read('lang/th/asset.ts');
    const en = read('lang/en/asset.ts');
    const worded = {
        warehouse: ['คลังกลาง สำนักงานใหญ่', 'Main Store, Head Office'],
        notes: ['ล็อตปี 2026', '2026 lot'],
        warranty_lifetime: ['ใช่', 'yes'],
    };
    for (const [key, [thWords, enWords]] of Object.entries(worded)) {
        assert.ok(th.includes(`asset_import_example_${key}: '${thWords}'`), key);
        assert.ok(en.includes(`asset_import_example_${key}: '${enWords}'`), key);
    }
    for (const kind of ['rented', 'purchased'] as const) {
        for (const column of IMPORT_COLUMNS[kind]) {
            if (column.key in worded) assert.deepEqual(column.example, { key: `asset_import_example_${column.key}` }, column.key);
            else assert.equal(typeof column.example, 'string', column.key);
            if (typeof column.example === 'string') assert.doesNotMatch(column.example, /[฀-๿]/, column.key);
        }
    }
    assert.match(read('modules/asset/components/import/import-upload-step.tsx'), /t\(column\.example\.key\)/);
});
