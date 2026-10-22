// Edit forms and fresh server data: untouched fields take the new values, typed ones stay, and a form seeds once per record.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsSeed, nextBase, rebaseForm, sameValue } from '../../resources/js/shared/lib/form-rebase.ts';

test('an untouched field takes the fresh server value', () => {
    const base = { a: '1', b: 'x' };
    assert.deepEqual(rebaseForm(base, { ...base }, { a: '2', b: 'x' }), { a: '2', b: 'x' });
});

test('a touched field keeps the user value even when the server changed it', () => {
    assert.deepEqual(rebaseForm({ a: '1' }, { a: 'typed' }, { a: '2' }), { a: 'typed' });
});

test('arrays compare by value', () => {
    assert.deepEqual(rebaseForm({ files: [1, 2] }, { files: [1, 2] }, { files: [1, 2, 3] }), { files: [1, 2, 3] });
});

test('skipped keys never change', () => {
    const base = { name: 'A', b: '1' };
    assert.deepEqual(rebaseForm(base, { ...base }, { name: 'B', b: '2' }, ['name']), { name: 'A', b: '2' });
});

test('a key the fresh record lacks keeps the form value', () => {
    const base: Record<string, string> = { a: '1', local: 'x' };
    assert.deepEqual(rebaseForm(base, { ...base }, { a: '1' }), { a: '1', local: 'x' });
});

test('same value treats equal objects as equal', () => {
    assert.equal(sameValue({ x: [1] }, { x: [1] }), true);
    assert.equal(sameValue('1', 1), false);
});

test('a form seeds once per record, not on every refresh of it', () => {
    assert.equal(needsSeed(null, 7), true);
    assert.equal(needsSeed(7, 7), false);
    assert.equal(needsSeed(7, 8), true);
    assert.equal(needsSeed(7, null), false);
});

test('a skipped key keeps its opening value in the base, so an untouched form stays clean', () => {
    assert.deepEqual(nextBase({ a: '1', ids: [1] }, { a: '2', ids: [1, 2] }, ['ids']), { a: '2', ids: [1] });
    assert.deepEqual(nextBase({ a: '1' }, { a: '2' }), { a: '2' });
});
