// Which employee ids an audit page needs names for.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditEmployeeIds } from '../../resources/js/modules/permission/lib/audit-employee-ids.ts';

test('collects distinct manager ids from both sides of a diff', () => {
    const rows = [
        { details: { changes: { manager_id: { from: 5, to: '9' } } } },
        { details: { changes: { manager_id: { from: 9, to: null } } } },
        { details: { changes: { department_id: { from: 1, to: 2 } } } },
        { details: null },
    ];
    assert.deepEqual(auditEmployeeIds(rows), [5, 9]);
});

test('ignores empty and non-numeric values', () => {
    assert.deepEqual(auditEmployeeIds([{ details: { changes: { manager_id: { from: '', to: 'x' } } } }]), []);
});
