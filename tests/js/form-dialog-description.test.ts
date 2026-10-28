// Form dialogs give FocusDialogHeader a real description, so a screen reader does not hear the title twice.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { common as en } from '../../resources/js/lang/en/common.ts';
import { common as th } from '../../resources/js/lang/th/common.ts';

const DIALOGS = [
    'resources/js/modules/employee/components/department-modal.tsx',
    'resources/js/modules/employee/components/position-modal.tsx',
    'resources/js/modules/employee/components/section-modal.tsx',
    'resources/js/modules/permission/components/role-modal.tsx',
];

for (const file of DIALOGS) {
    test(`${file.split('/').pop()} describes the form instead of repeating its title`, () => {
        assert.match(readFileSync(file, 'utf8'), /srDescription=\{[^}]*t\('form_modal_desc'\)/);
    });
}

test('the description is worded in both languages', () => {
    assert.equal(th.form_modal_desc, 'กรอกข้อมูลแล้วกดบันทึก');
    assert.equal(en.form_modal_desc, 'Fill in the details, then save.');
});
