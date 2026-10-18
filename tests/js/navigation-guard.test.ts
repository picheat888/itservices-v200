// The navigation guard stops a move that leaves the page or changes a watched ?param, and lets the rest through.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isGuardedMove, isPlainLinkClick } from '../../resources/js/shared/lib/navigation-guard.ts';

const url = (path: string) => new URL(path, 'https://desk.test');
const WATCH = ['tab', 'role'];

test('another page is guarded', () => {
    assert.equal(isGuardedMove(url('/permissions?tab=templates'), url('/tickets'), WATCH), true);
});

test('another origin and non-web links pass (beforeunload covers leaving the app)', () => {
    assert.equal(isGuardedMove(url('/permissions'), new URL('https://other.test/permissions'), WATCH), false);
    assert.equal(isGuardedMove(url('/permissions'), new URL('http://desk.test/tickets'), WATCH), false);
    assert.equal(isGuardedMove(url('/permissions'), new URL('mailto:it@desk.test'), WATCH), false);
    assert.equal(isGuardedMove(url('/permissions'), new URL('tel:+6621234567'), WATCH), false);
    assert.equal(isGuardedMove(url('/permissions'), new URL('javascript:void(0)'), WATCH), false);
});

test('a watched param change is guarded', () => {
    assert.equal(isGuardedMove(url('/permissions?tab=templates'), url('/permissions?tab=groups'), WATCH), true);
    assert.equal(isGuardedMove(url('/permissions?role=hr'), url('/permissions'), WATCH), true);
});

test('an unwatched param change (a dialog) passes', () => {
    assert.equal(isGuardedMove(url('/permissions?role=hr'), url('/permissions?role=hr&dialog=profile'), WATCH), false);
    assert.equal(isGuardedMove(url('/permissions?tab=templates'), url('/permissions?tab=templates'), []), false);
});

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const anchor = (target = '', download = false) => ({ target, hasAttribute: (name: string) => name === 'download' && download });

test('a plain left click on a same-tab link is the router move', () => {
    assert.equal(isPlainLinkClick(click, anchor()), true);
    assert.equal(isPlainLinkClick(click, anchor('_self')), true);
});

test('modifier keys, other buttons, new tabs, downloads and handled clicks are left alone', () => {
    assert.equal(isPlainLinkClick({ ...click, ctrlKey: true }, anchor()), false);
    assert.equal(isPlainLinkClick({ ...click, metaKey: true }, anchor()), false);
    assert.equal(isPlainLinkClick({ ...click, button: 1 }, anchor()), false);
    assert.equal(isPlainLinkClick({ ...click, defaultPrevented: true }, anchor()), false);
    assert.equal(isPlainLinkClick(click, anchor('_blank')), false);
    assert.equal(isPlainLinkClick(click, anchor('', true)), false);
});
