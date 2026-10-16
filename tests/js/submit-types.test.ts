// canFileAnyRequest: filing needs requests.submit and at least one per-type key.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canFileAnyRequest } from '../../resources/js/modules/request/lib/submit-types.ts';

const holding = (keys: string[]) => (key: string) => keys.includes(key);

test('submit plus one type may file', () => assert.equal(canFileAnyRequest(holding(['requests.submit', 'requests.submit_cctv'])), true));
test('submit with no type may not file', () => assert.equal(canFileAnyRequest(holding(['requests.submit'])), false));
test('a type without submit may not file', () => assert.equal(canFileAnyRequest(holding(['requests.submit_cctv'])), false));
