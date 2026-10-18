// Menu return-focus tracker: a dialog may claim the ⋮ button only right after one of its items was picked, and only once.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimMenuTrigger, markMenuItemPicked, rememberMenuTrigger } from '../../resources/js/shared/lib/menu-return-focus.ts';

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
