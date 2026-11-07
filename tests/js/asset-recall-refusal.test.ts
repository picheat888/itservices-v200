// A refused single recall: "the recipient already accepted" only for that refusal, the server's own words for the rest.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { asset as th } from '../../resources/js/lang/th/asset.ts';
import { recipientAcceptedFirst } from '../../resources/js/modules/asset/lib/recall-refusal.ts';

const modal = readFileSync(new URL('../../resources/js/modules/asset/components/asset-receive-modal.tsx', import.meta.url), 'utf8');

test('a pending hand-over refused as not recallable means the recipient accepted first', () => {
    assert.equal(recipientAcceptedFirst('recall_not_allowed', 'pending_acceptance'), true);
});

test('every other refusal keeps the server code', () => {
    assert.equal(recipientAcceptedFirst('recall_already_ready', 'pending_acceptance'), false);
    assert.equal(recipientAcceptedFirst('recall_writeoff', 'pending_acceptance'), false);
    assert.equal(recipientAcceptedFirst('The selected warehouse is invalid.', 'pending_acceptance'), false);
    assert.equal(recipientAcceptedFirst(undefined, 'pending_acceptance'), false);
});

test('a shared asset or a force recall has no recipient who could have accepted', () => {
    assert.equal(recipientAcceptedFirst('recall_not_allowed', 'common'), false);
    assert.equal(recipientAcceptedFirst('recall_not_allowed', 'deployed'), false);
    assert.equal(recipientAcceptedFirst('recall_not_allowed', undefined), false);
});

test('the dialog words the rest by the server refusal, not by the status code alone', () => {
    assert.match(modal, /recipientAcceptedFirst\(refusalReason\(err\)\?\.reason, asset\?\.status\)/);
    assert.match(modal, /serverMessage\(err, t, 'asset_refusal_'\) \?\? t\('asset_action_failed'\)/);
    assert.doesNotMatch(modal, /status === 422/);
});

test('the refusal words this decision chooses between', () => {
    assert.equal(th.asset_recall_stale, 'ผู้รับกดรับทรัพย์สินนี้ไปแล้ว');
    assert.equal(th.asset_refusal_recall_already_ready, 'ทรัพย์สินนี้พร้อมส่งมอบอยู่แล้ว');
});
