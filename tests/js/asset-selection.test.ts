// Asset list multi-select: which statuses can be ticked per permission (AST-11), and the status lock across pages (AST-10).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allFreeRentals, bulkActionFor, toggleGroup, type BulkPermissions } from '../../resources/js/modules/asset/lib/selection.ts';

const none: BulkPermissions = { transfer: false, receive: false, forceRecall: false, edit: false, retire: false, linkContract: false };

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
    assert.equal(bulkActionFor('writeoff', { transfer: true, receive: true, forceRecall: true, edit: true, retire: true, linkContract: false }), null);
});

test('with the link filter on, an edit-only role can tick every status but written off', () => {
    const link = { ...none, edit: true, linkContract: true };
    assert.equal(bulkActionFor('ready', link), 'link_contract');
    assert.equal(bulkActionFor('pending_return', link), 'link_contract');
    assert.equal(bulkActionFor('deployed', link), 'relocate');
    assert.equal(bulkActionFor('writeoff', link), null);
    assert.equal(bulkActionFor('ready', { ...none, edit: true }), null);
});

test('the link button needs every ticked asset to be a free rental', () => {
    assert.equal(allFreeRentals([1, 2], { 1: true, 2: true }), true);
    assert.equal(allFreeRentals([1, 2], { 1: true, 2: false }), false);
    assert.equal(allFreeRentals([1, 3], { 1: true }), false);
    assert.equal(allFreeRentals([], {}), false);
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
