// REQ-1: the words for a step nobody can approve, in the trail and in the strip under the request's title.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { requests as en } from '../../resources/js/lang/en/requests.ts';
import { requests as th } from '../../resources/js/lang/th/requests.ts';
import { blockedNoteKey, stuckLineKey, stuckStep } from '../../resources/js/modules/request/lib/approval-block.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const row = (over: Record<string, unknown>) =>
    ({ kind: 'approval', status: 'current', label: 'Manager', approver_employee_id: 7, blocked: null, ...over }) as never;

test('each blocked case has its own trail note and strip line', () => {
    assert.equal(blockedNoteKey(row({ blocked: 'left' })), 'req_await_left');
    assert.equal(blockedNoteKey(row({ blocked: 'no_account' })), 'req_await_account');
    assert.equal(blockedNoteKey(row({ blocked: 'left', approver_employee_id: null })), 'req_await_group_left');
    assert.equal(blockedNoteKey(row({ blocked: 'no_account', approver_employee_id: null })), 'req_await_group_no_account');
    assert.equal(blockedNoteKey(row({})), null);

    assert.equal(stuckLineKey(row({ blocked: 'left' })), 'req_stuck_left');
    assert.equal(stuckLineKey(row({ blocked: 'no_account', approver_employee_id: null })), 'req_stuck_group_no_account');
});

test('only a pending request is stuck, and only on its current approval step', () => {
    const stuck = row({ blocked: 'left' });
    assert.equal(stuckStep({ status: 'pending', approvals: [row({ status: 'approved' }), stuck] } as never), stuck);
    assert.equal(stuckStep({ status: 'approved', approvals: [stuck] } as never), null);
    assert.equal(stuckStep({ status: 'pending', approvals: [row({ status: 'waiting', blocked: 'left' })] } as never), null);
    assert.equal(stuckStep({ status: 'pending', approvals: [row({})] } as never), null);
});

test('every key exists in both languages and the strip names the step', () => {
    for (const key of [
        'req_await_left',
        'req_await_group_left',
        'req_await_group_no_account',
        'req_stuck_title',
        'req_stuck_left',
        'req_stuck_no_account',
        'req_stuck_group_left',
        'req_stuck_group_no_account',
    ]) {
        assert.ok((en as Record<string, string>)[key], `en ${key}`);
        assert.ok((th as Record<string, string>)[key], `th ${key}`);
        if (key.startsWith('req_stuck_') && key !== 'req_stuck_title') {
            assert.ok((th as Record<string, string>)[key].includes('"{step}"'), `th ${key} names the step`);
            assert.ok((th as Record<string, string>)[key].endsWith('ติดต่อ IT'), `th ${key} says who to contact`);
        }
    }
});

test('the detail shows the strip and the trail reads the live flag', () => {
    assert.match(read('resources/js/modules/request/components/request-detail-dialog.tsx'), /<RequestStuckStrip request=\{request\} \/>/);
    const trail = read('resources/js/modules/request/components/request-trail.tsx');
    assert.match(trail, /blockedNoteKey\(row\)/);
    assert.doesNotMatch(trail, /awaiting_account/);
});
