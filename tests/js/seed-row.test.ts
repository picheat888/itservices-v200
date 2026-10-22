// A list row opens a detail dialog at once, and the full record still loads (a row copy never counts as fresh or replaces it).
import { QueryClient } from '@tanstack/query-core';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedRowCopy } from '../../resources/js/shared/lib/seed-row.ts';

const key = ['ticket', 'view', 3];

test('a row copy fills an empty cache and stays stale, so the full record is fetched', () => {
    const qc = new QueryClient();
    seedRowCopy(qc, key, { id: 3, subject: 'row' });
    assert.deepEqual(qc.getQueryData(key), { id: 3, subject: 'row' });
    assert.equal(qc.getQueryState(key)?.isInvalidated, true);
});

test('a row copy never replaces the full record already in the cache', () => {
    const qc = new QueryClient();
    qc.setQueryData(key, { id: 3, subject: 'full', updates: [] });
    seedRowCopy(qc, key, { id: 3, subject: 'row' });
    assert.deepEqual(qc.getQueryData(key), { id: 3, subject: 'full', updates: [] });
});
