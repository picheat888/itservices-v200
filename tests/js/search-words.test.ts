// Client-side search matches the way the server's SearchTerms does: every word, any order.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesAllWords, searchWords } from '../../resources/js/shared/lib/search-words.ts';

const row = 'John Smith สมชาย ใจดี EMP0012 IT';

test('every word must be found, in any order, ignoring case', () => {
    assert.equal(matchesAllWords(row, 'john smith'), true);
    assert.equal(matchesAllWords(row, 'smith john'), true);
    assert.equal(matchesAllWords(row, 'ใจดี สมชาย'), true);
    assert.equal(matchesAllWords(row, 'JOHN emp0012'), true);
    assert.equal(matchesAllWords(row, 'john finance'), false);
});

test('spacing is cleaned like the server does', () => {
    assert.equal(matchesAllWords(row, '  john   smith  '), true);
    assert.equal(matchesAllWords(row, 'john smith'), true);
    assert.equal(matchesAllWords(row, 'jo​hn'), true);
});

test('an empty search matches everything', () => {
    assert.equal(matchesAllWords(row, ''), true);
    assert.equal(matchesAllWords(row, '   '), true);
});

test('words are distinct and at most six, like SearchTerms::words', () => {
    assert.deepEqual(searchWords('IT it It'), ['it']);
    assert.deepEqual(searchWords('a b c d e f g h'), ['a', 'b', 'c', 'd', 'e', 'f']);
});
