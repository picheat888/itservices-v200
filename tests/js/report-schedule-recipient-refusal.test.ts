// UAT RPT-31-06: removing a recipient someone already removed says so in the confirm window, not "try again".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { report as th } from '../../resources/js/lang/th/report.ts';

const dialog = readFileSync(join(import.meta.dirname, '../../resources/js/modules/report/components/manage-schedules-dialog.tsx'), 'utf8');

test('the remove-recipient and delete confirms word the server refusal code', () => {
    const removeConfirm = dialog.slice(dialog.indexOf('const onRemoveRecipient'), dialog.indexOf('const onRemoveRecipient') + 1400);
    assert.match(removeConfirm, /errorMessage: \(e\) => refusalText\(e, t, REFUSAL\),/);
    const deleteConfirm = dialog.slice(dialog.indexOf('const onDelete'), dialog.indexOf('const onDelete') + 700);
    assert.match(deleteConfirm, /errorMessage: \(e\) => refusalText\(e, t, REFUSAL\),/);
    assert.match(dialog, /const REFUSAL = 'rep_manage_refusal_';/);
});

test('the recipient_missing words are the ones the test book expects', () => {
    assert.equal(th.rep_manage_refusal_recipient_missing, 'อีเมลนี้ไม่อยู่ในรายการผู้รับแล้ว');
});
