// The manager field's refusals: server codes to their cause, and when a resigned manager blocks saving.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MANAGER_REFUSAL_KEY, managerHasLeft, managerRefusal } from '../../resources/js/modules/employee/lib/manager-refusal.ts';

test('each server code names its own cause', () => {
    assert.equal(managerRefusal('manager_loop'), 'loop');
    assert.equal(managerRefusal('manager_resigned'), 'resigned');
    assert.equal(managerRefusal('manager_not_found'), 'not_found');
    assert.equal(managerRefusal('Something else'), null);
    assert.equal(managerRefusal(undefined), null);
});

test('only a loop goes to the panel; the others are worded under the field', () => {
    assert.equal(MANAGER_REFUSAL_KEY.resigned, 'emp_err_manager_resigned');
    assert.equal(MANAGER_REFUSAL_KEY.not_found, 'emp_err_manager_not_found');
    assert.equal('loop' in MANAGER_REFUSAL_KEY, false);
});

test('a resigned manager blocks an active employee but not one who has left too', () => {
    assert.equal(managerHasLeft({ status: 'resigned' }, 'active'), true);
    assert.equal(managerHasLeft({ status: 'resigned' }, undefined), true);
    assert.equal(managerHasLeft({ status: 'resigned' }, 'resigned'), false);
    assert.equal(managerHasLeft({ status: 'active' }, 'active'), false);
    assert.equal(managerHasLeft(undefined, 'active'), false);
});
