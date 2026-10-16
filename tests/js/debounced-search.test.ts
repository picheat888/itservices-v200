// The search text a server list sends: cleaned the way the server cleans it, so spacing edits cost no request.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSearch, SEARCH_DEBOUNCE_MS } from '../../resources/js/shared/hooks/use-debounced-search.ts';

test('spaces are collapsed and trimmed, Thai and English alike', () => {
    assert.equal(normalizeSearch('  สมชาย   ใจดี  '), 'สมชาย ใจดี');
    assert.equal(normalizeSearch('Somchai\t\nJaidee '), 'Somchai Jaidee');
    assert.equal(normalizeSearch('สมชาย\u00A0ใจดี\u3000IT'), 'สมชาย ใจดี IT');
});

test('a trailing space typed between words sends the same search', () => {
    assert.equal(normalizeSearch('สมชาย '), normalizeSearch('สมชาย'));
});

test('zero-width characters pasted from Word are dropped', () => {
    assert.equal(normalizeSearch('สม\u200Bชาย\uFEFF'), 'สมชาย');
});

test('blank input is empty, special characters are kept', () => {
    assert.equal(normalizeSearch('   \u200B '), '');
    assert.equal(normalizeSearch('100% a_b'), '100% a_b');
});

test('the pause before sending is 300ms', () => {
    assert.equal(SEARCH_DEBOUNCE_MS, 300);
});
