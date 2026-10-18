// Menu return-focus tracker: a dialog may claim the ⋮ button only right after one of its items was picked, and only once.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimMenuTrigger, markMenuItemPicked, rememberMenuTrigger, rowToRefocus } from '../../resources/js/shared/lib/menu-return-focus.ts';

const button = (name: string) => ({ name }) as unknown as HTMLElement;

test('nothing to claim until an item is picked', () => {
    rememberMenuTrigger(button('kebab-1'));
    assert.equal(claimMenuTrigger(), null);
});

test('the dialog opened by a picked item gets the button, a second dialog does not', () => {
    const kebab = button('kebab-2');
    rememberMenuTrigger(kebab);
    markMenuItemPicked();
    assert.equal(claimMenuTrigger(), kebab);
    assert.equal(claimMenuTrigger(), null);
});

test('a dialog opening long after the pick is not tied to the menu', (t) => {
    rememberMenuTrigger(button('kebab-3'));
    const now = performance.now();
    t.mock.method(performance, 'now', () => now);
    markMenuItemPicked();
    t.mock.method(performance, 'now', () => now + 5000);
    assert.equal(claimMenuTrigger(), null);
});

test('a deleted row hands focus to the row that took its place', () => {
    assert.equal(rowToRefocus([true, true, true], 1), 1);
});

test('deleting the last row hands focus to the row above', () => {
    assert.equal(rowToRefocus([true, true], 2), 1);
});

test('rows without a menu button are skipped, forward first', () => {
    assert.equal(rowToRefocus([true, false, false, true], 1), 3);
    assert.equal(rowToRefocus([true, false, false], 2), 0);
});

test('skeleton rows or an empty table give nothing to focus yet', () => {
    assert.equal(rowToRefocus([false, false, false], 0), null);
    assert.equal(rowToRefocus([], 0), null);
});
