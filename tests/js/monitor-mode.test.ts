// Monitor TV: board only with a device token, the pairing countdown on a wrong clock, and the one CSRF retry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeLeftMs, monitorMode, withCsrfRetry } from '../../resources/js/modules/monitor/lib/monitor-mode.ts';

test('a stored device token shows the board', () => {
    assert.equal(monitorMode('abc'), 'board');
});

test('without a token every browser pairs, signed in or not', () => {
    assert.equal(monitorMode(null), 'pairing');
});

test('the code countdown runs from when the reply arrived, not the TV clock', () => {
    assert.equal(codeLeftMs(1_000, 300, 61_000), 240_000);
    assert.equal(codeLeftMs(1_000, 300, 400_000), 0);
});

test('a 419 refreshes the CSRF cookie and tries once more', async () => {
    let calls = 0;
    let refreshed = 0;
    const result = await withCsrfRetry(
        async () => {
            calls += 1;
            if (calls === 1) throw { isAxiosError: true, response: { status: 419 } };
            return 'ok';
        },
        async () => {
            refreshed += 1;
        },
    );
    assert.equal(result, 'ok');
    assert.deepEqual([calls, refreshed], [2, 1]);
});

test('other errors are not retried', async () => {
    let calls = 0;
    await assert.rejects(
        withCsrfRetry(
            async () => {
                calls += 1;
                throw { isAxiosError: true, response: { status: 500 } };
            },
            async () => {},
        ),
    );
    assert.equal(calls, 1);
});
