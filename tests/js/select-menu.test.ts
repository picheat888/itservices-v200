// SearchableSelect menu: room for the reload status from the start, and no on-screen keyboard on touch screens until the search box is tapped.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstEnabled, menuMinWidth, RELOAD_MENU_MIN_PX, searchGetsFocus, stepActive } from '../../resources/js/shared/lib/select-menu.ts';

test('a reloading list opens at least 288 px wide so the status never widens it', () => {
    assert.equal(RELOAD_MENU_MIN_PX, 288);
    assert.equal(menuMinWidth(240, true), 288);
    assert.equal(menuMinWidth(360, true), 360);
});

test('a plain dropdown keeps the trigger width as its floor', () => {
    assert.equal(menuMinWidth(240, false), 240);
});

test('on a touch screen a short list opens without the keyboard', () => {
    assert.equal(searchGetsFocus({ coarsePointer: true, isAsync: false, optionCount: 8 }), false);
    assert.equal(searchGetsFocus({ coarsePointer: true, isAsync: false, optionCount: 0 }), false);
});

test('on a touch screen a long list also opens without the keyboard', () => {
    assert.equal(searchGetsFocus({ coarsePointer: true, isAsync: false, optionCount: 9 }), false);
});

test('on a touch screen a people picker that searches the server also waits for a tap', () => {
    assert.equal(searchGetsFocus({ coarsePointer: true, isAsync: true, optionCount: 0 }), false);
});

test('with a mouse the search box always gets focus', () => {
    assert.equal(searchGetsFocus({ coarsePointer: false, isAsync: false, optionCount: 2 }), true);
    assert.equal(searchGetsFocus({ coarsePointer: false, isAsync: true, optionCount: 0 }), true);
});

const off = [false, true, false, true];

test('the arrow keys skip rows that cannot be chosen', () => {
    assert.equal(stepActive(off, 0, 1), 2);
    assert.equal(stepActive(off, 2, 1), 0);
    assert.equal(stepActive(off, 2, -1), 0);
    assert.equal(stepActive(off, 0, -1), 2);
});

test('the highlight moves off a row that cannot be chosen', () => {
    assert.equal(firstEnabled(off, 1), 2);
    assert.equal(firstEnabled(off, 3), 0);
    assert.equal(firstEnabled(off, 0), 0);
});

test('a list where nothing can be chosen has no highlight', () => {
    assert.equal(firstEnabled([true, true], 0), -1);
    assert.equal(stepActive([true, true], 0, 1), -1);
    assert.equal(firstEnabled([], 0), -1);
});
