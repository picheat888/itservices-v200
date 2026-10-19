// Top-layer dialog registry: the error dialog waits while the idle warning or account-switched dialog is on screen.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { holdTopDialog, isTopDialogOpen, subscribeTopDialogs } from '../../resources/js/shared/lib/top-dialogs.ts';

test('a top dialog is open while any hold is kept', () => {
    assert.equal(isTopDialogOpen(), false);
    const releaseWarning = holdTopDialog();
    const releaseSwitched = holdTopDialog();
    assert.equal(isTopDialogOpen(), true);
    releaseWarning();
    assert.equal(isTopDialogOpen(), true);
    releaseSwitched();
    assert.equal(isTopDialogOpen(), false);
});

test('releasing the same hold twice does not end another dialog', () => {
    const releaseFirst = holdTopDialog();
    const releaseSecond = holdTopDialog();
    releaseFirst();
    releaseFirst();
    assert.equal(isTopDialogOpen(), true);
    releaseSecond();
    assert.equal(isTopDialogOpen(), false);
});

test('listeners hear every open and close until they unsubscribe', () => {
    const heard: boolean[] = [];
    const unsubscribe = subscribeTopDialogs(() => heard.push(isTopDialogOpen()));
    const release = holdTopDialog();
    release();
    unsubscribe();
    holdTopDialog()();
    assert.deepEqual(heard, [true, false]);
});
