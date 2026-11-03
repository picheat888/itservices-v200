// Settings → จอ Monitor: what lands in the 6 code boxes from typing or pasting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePairCode } from '../../resources/js/modules/settings/lib/pair-code.ts';

test('a pasted code with its space fills all six boxes', () => {
    assert.equal(normalizePairCode('482 913'), '482913');
});

test('anything but digits is dropped', () => {
    assert.equal(normalizePairCode('48a2'), '482');
    assert.equal(normalizePairCode('-4-8-2-'), '482');
});

test('a code never runs past six digits', () => {
    assert.equal(normalizePairCode('48291355'), '482913');
});
