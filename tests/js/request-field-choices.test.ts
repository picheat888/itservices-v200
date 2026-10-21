// New Request lists: a chosen item the reloaded list lost blocks Next, and the review step still names it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choiceGone, findChoice } from '../../resources/js/modules/request/lib/field-choices.ts';

const share = (id: number, label: string) => ({ id, label, detail: null });
const device = (value: string, label_en: string) => ({ value, label_en, label_th: label_en });

test('a chosen file share missing from the reloaded list is gone', () => {
    assert.equal(choiceGone('7', [share(1, '\\fs01\HR')]), true);
});

test('a chosen managed choice missing from the reloaded list is gone', () => {
    assert.equal(choiceGone('3', [device('1', 'Monitor')]), true);
    assert.equal(choiceGone('1', [device('1', 'Monitor')]), false);
});

test('a field whose list never loaded, or an empty value, is never gone', () => {
    assert.equal(choiceGone('7', undefined), false);
    assert.equal(choiceGone('', [share(1, 'x')]), false);
});

test('the review step falls back to the first list that still holds the value', () => {
    assert.deepEqual(findChoice('7', [share(1, 'new')], [share(7, '\\fs01\Old')]), share(7, '\\fs01\Old'));
    assert.deepEqual(findChoice('1', [share(1, 'new')], [share(1, 'old')]), share(1, 'new'));
    assert.equal(findChoice('9', [share(1, 'new')], undefined), undefined);
});
