// A dialog opened over a page keeps the page's query; closing it drops only the dialog and its companion params.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dialogCloseParams, mergeDialogSearch, resolveNotificationTarget } from '../../resources/js/shared/lib/dialog-search.ts';

test('merging keeps the page query and adds the dialog params', () => {
    assert.equal(mergeDialogSearch('?tab=my&view=12', { dialog: 'profile', section: 'assets' }), '?tab=my&view=12&dialog=profile&section=assets');
});

test('merging overwrites an existing dialog param', () => {
    assert.equal(mergeDialogSearch('?dialog=password', { dialog: 'profile' }), '?dialog=profile');
});

test('closing drops dialog and its companions only', () => {
    const out = dialogCloseParams(new URLSearchParams('tab=my&dialog=profile&section=assets'), ['section']);
    assert.equal(out.toString(), 'tab=my');
});

test('a path target passes through unchanged', () => {
    assert.equal(resolveNotificationTarget('/assets', '?tab=my'), '/assets');
});

test('a query target merges into the current page query', () => {
    assert.deepEqual(resolveNotificationTarget('?dialog=profile&section=assets', '?tab=my'), { search: '?tab=my&dialog=profile&section=assets' });
});
