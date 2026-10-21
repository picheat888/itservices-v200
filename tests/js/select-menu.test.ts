// SearchableSelect menu: room for the reload status from the start, and no on-screen keyboard for short lists on touch screens.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menuMinWidth, RELOAD_MENU_MIN_PX, searchGetsFocus, SHORT_LIST_MAX } from '../../resources/js/shared/lib/select-menu.ts';

test('a reloading list opens at least 288 px wide so the status never widens it', () => {
    assert.equal(RELOAD_MENU_MIN_PX, 288);
    assert.equal(menuMinWidth(240, true), 288);
    assert.equal(menuMinWidth(360, true), 360);
});

test('a plain dropdown keeps the trigger width as its floor', () => {
    assert.equal(menuMinWidth(240, false), 240);
});

test('on a touch screen a short list opens without the keyboard', () => {
    assert.equal(SHORT_LIST_MAX, 8);
    assert.equal(searchGetsFocus({ coarsePointer: true, isAsync: false, optionCount: 8 }), false);
    assert.equal(searchGetsFocus({ coarsePointer: true, isAsync: false, optionCount: 0 }), false);
});

test('on a touch screen a long list still focuses the search box', () => {
    assert.equal(searchGetsFocus({ coarsePointer: true, isAsync: false, optionCount: 9 }), true);
});

test('a people picker that searches the server always focuses the search box', () => {
    assert.equal(searchGetsFocus({ coarsePointer: true, isAsync: true, optionCount: 0 }), true);
});

test('with a mouse the search box always gets focus', () => {
    assert.equal(searchGetsFocus({ coarsePointer: false, isAsync: false, optionCount: 2 }), true);
});
