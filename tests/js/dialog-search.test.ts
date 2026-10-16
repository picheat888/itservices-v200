// A dialog opened over a page keeps the page's query; closing it drops only the dialog and its companion params.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dialogCloseParams, mergeDialogSearch } from '../../resources/js/shared/lib/dialog-search.ts';

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
