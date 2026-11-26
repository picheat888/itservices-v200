// Asset import dialog logic: steps, row edits, local checks, dropdown options, summary groups and the run payload.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { CheckedRow, ImportOptions, Issue } from '../../resources/js/modules/asset/api/assetImportApi.ts';
import { IMPORT_COLUMNS } from '../../resources/js/modules/asset/lib/import-columns.ts';
import {
    badRowCount,
    fillIssueWords,
    foldAt,
    importRunPayload,
    localIssues,
    optionsFor,
    rowsWithEdits,
    summaryGroups,
} from '../../resources/js/modules/asset/lib/import-rows.ts';
import { canLeaveStep, importSteps, stepAfterRefusal } from '../../resources/js/modules/asset/lib/import-wizard.ts';

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
    const rows = [row(2, { serial: 'AB 1' }), row(3), row(5, { serial: 'ab  1' }, [{ code: 'dup_in_file', column: 'serial', line: 2 }])];
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
    const check = (text: string, dateFormat: 'dmy_slash' | 'ymd_slash' | 'd_mon_y') =>
        localIssues(rows[0], 'purchase_date', text, { ...ctx, dateFormat }).length;
    assert.equal(check('12/11/2026', 'dmy_slash'), 0);
    assert.equal(check('12-11-2026', 'dmy_slash'), 0);
    assert.equal(check('2026/11/12', 'dmy_slash'), 1);
    assert.equal(check('2026/11/12', 'ymd_slash'), 0);
    assert.equal(check('12/11/2026', 'ymd_slash'), 1);
    assert.equal(check('2026-11-12', 'ymd_slash'), 0);
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
