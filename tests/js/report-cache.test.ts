// Report cache: one error report per distinct crash, its reference reused, capped per page.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReportCache } from '../../resources/js/shared/lib/report-cache.ts';

test('the same crash reuses the first report and its reference', async () => {
    const cache = createReportCache(10);
    let sends = 0;
    const send = () => {
        sends++;
        return Promise.resolve('abc123');
    };
    assert.equal(await cache('k', send), 'abc123');
    assert.equal(await cache('k', send), 'abc123');
    assert.equal(sends, 1);
});

test('a failed report gives no reference, and the cap stops sending', async () => {
    const cache = createReportCache(1);
    assert.equal(await cache('a', () => Promise.reject(new Error('offline'))), null);
    assert.equal(await cache('b', () => Promise.resolve('x')), null);
});
