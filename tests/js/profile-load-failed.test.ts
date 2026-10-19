// The profile tabs show the "load failed" panel only when a failed fetch left nothing to show.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { showLoadFailed } from '../../resources/js/modules/profile/lib/load-failed.ts';

test('a failed first load, with nothing to show, shows the panel', () => assert.equal(showLoadFailed({ isError: true, hasData: false }), true));
test('a failed refetch keeps the data on screen', () => assert.equal(showLoadFailed({ isError: true, hasData: true }), false));
test('no failure never shows the panel', () => {
    assert.equal(showLoadFailed({ isError: false, hasData: false }), false);
    assert.equal(showLoadFailed({ isError: false, hasData: true }), false);
});
