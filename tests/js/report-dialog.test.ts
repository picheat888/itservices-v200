// A report page opens its export / schedule dialog from ?dialog= only for a reader with that right.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportDialogAllowed } from '../../resources/js/modules/report/lib/report-dialog.ts';

const rights = (canExport: boolean, canSchedule: boolean) => ({ canExport, canSchedule });

test('each dialog follows its own right', () => {
    assert.equal(reportDialogAllowed('export', rights(true, false)), true);
    assert.equal(reportDialogAllowed('export', rights(false, true)), false);
    assert.equal(reportDialogAllowed('schedule', rights(false, true)), true);
    assert.equal(reportDialogAllowed('schedule', rights(true, false)), false);
});

test('no dialog is always fine', () => {
    assert.equal(reportDialogAllowed(null, rights(false, false)), true);
});
