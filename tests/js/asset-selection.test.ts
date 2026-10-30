// Asset list multi-select: which statuses can be ticked per permission (AST-11), and the status lock across pages (AST-10).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bulkActionFor, toggleGroup, type BulkPermissions } from '../../resources/js/modules/asset/lib/selection.ts';

const none: BulkPermissions = { transfer: false, receive: false, forceRecall: false, edit: false, retire: false };

test('a ready row can be ticked to write off by a role that may retire but not transfer', () => {
    assert.equal(bulkActionFor('ready', { ...none, retire: true }), 'writeoff');
    assert.equal(bulkActionFor('ready', { ...none, transfer: true, retire: true }), 'transfer');
    assert.equal(bulkActionFor('ready', none), null);
});

test('the other statuses keep their bulk actions', () => {
    assert.equal(bulkActionFor('pending_acceptance', { ...none, forceRecall: true }), 'recall');
    assert.equal(bulkActionFor('common', { ...none, edit: true }), 'relocate');
    assert.equal(bulkActionFor('deployed', { ...none, forceRecall: true }), 'force_recall');
    assert.equal(bulkActionFor('pending_return', { ...none, receive: true }), 'receive');
    assert.equal(bulkActionFor('writeoff', { transfer: true, receive: true, forceRecall: true, edit: true, retire: true }), null);
});

test('unticking a page keeps the lock while rows from another page stay ticked', () => {
    // Rows 1 and 2 ticked on page 1, then page 2's rows 7 and 8 ticked and unticked from the header.
    const ticked = toggleGroup([1, 2], [7, 8], true, 'ready', 'ready');
    assert.deepEqual(ticked, { ids: [1, 2, 7, 8], status: 'ready' });
    assert.deepEqual(toggleGroup(ticked.ids, [7, 8], false, 'ready', 'ready'), { ids: [1, 2], status: 'ready' });
});

test('the lock clears once nothing is ticked, and a first tick takes the group status', () => {
    assert.deepEqual(toggleGroup([7, 8], [7, 8], false, 'ready', 'ready'), { ids: [], status: null });
    assert.deepEqual(toggleGroup([], [3, 4], true, null, 'deployed'), { ids: [3, 4], status: 'deployed' });
});
