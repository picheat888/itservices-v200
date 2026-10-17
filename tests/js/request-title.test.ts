// requestTitle names the person a request is for in the reader's language.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestTitle } from '../../resources/js/shared/lib/request-meta.ts';

const t = (key: string) => ({ req_auto_title_for: '{service} for {name}', req_computer: 'Computer' })[key] ?? key;

test('an on-behalf title uses the Thai requester name in Thai and falls back to the English name', () => {
    const base = { type: 'computer', origin: 'onboarding' } as const;
    assert.equal(requestTitle({ ...base, requester: { name: 'Somchai Jaidee', name_th: 'สมชาย ใจดี' } }, t, 'th'), 'Computer for สมชาย ใจดี');
    assert.equal(requestTitle({ ...base, requester: { name: 'Somchai Jaidee', name_th: null } }, t, 'th'), 'Computer for Somchai Jaidee');
    assert.equal(requestTitle({ ...base, requester: { name: 'Somchai Jaidee', name_th: 'สมชาย ใจดี' } }, t, 'en'), 'Computer for Somchai Jaidee');
});
