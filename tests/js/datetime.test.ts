// Asserts the TS date formatter against the fixture PHP's DateDisplayTest also reads.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindDateFormat } from '../../resources/js/shared/lib/datetime.ts';

interface Case {
    fn: string;
    args: (string | number | null)[];
    config: Record<string, string>;
    lang: string;
    expect: string;
}

const { cases } = JSON.parse(readFileSync(new URL('../Fixtures/date-format-cases.json', import.meta.url), 'utf8')) as { cases: Case[] };

for (const [i, c] of cases.entries()) {
    test(`#${i} ${c.fn}(${c.args.map((a) => JSON.stringify(a)).join(', ')}) ${JSON.stringify(c.config)} ${c.lang}`, () => {
        const fmt = bindDateFormat(c.config, c.lang) as unknown as Record<string, (...args: unknown[]) => string>;
        assert.equal(fmt[c.fn](...c.args), c.expect);
    });
}

test('the legacy helpers are gone', async () => {
    const mod = (await import('../../resources/js/shared/lib/datetime.ts')) as Record<string, unknown>;
    assert.equal(mod.formatDateTime, undefined);
    assert.equal(mod.formatDateShort, undefined);
    assert.equal(mod.formatRangeShort, undefined);
});

test('sameDateConfig compares the three values, not the object', async () => {
    const { sameDateConfig } = (await import('../../resources/js/shared/lib/datetime.ts')) as Record<string, (a: unknown, b: unknown) => boolean>;
    assert.equal(sameDateConfig({ format: 'dmy_slash', era: 'ce', time: '24' }, { format: 'dmy_slash', era: 'ce', time: '24' }), true);
    assert.equal(sameDateConfig({ format: 'dmy_slash', era: 'ce', time: '24' }, { format: 'dmy_slash', era: 'be', time: '24' }), false);
});

test('dateWidthSamples lists every month on a two-digit day, and every clock edge', async () => {
    const { dateWidthSamples } = (await import('../../resources/js/shared/lib/datetime.ts')) as Record<
        string,
        (c: unknown, l: string) => { dates: string[]; times: string[] }
    >;
    const th = dateWidthSamples({ format: 'd_month_y', era: 'be', time: '12' }, 'th');
    assert.equal(th.dates.length, 12);
    assert.ok(th.dates.includes('28 พฤศจิกายน 2569'));
    assert.deepEqual(th.times, ['12:59 PM', '10:58 AM', '11:59 PM']);
    const en = dateWidthSamples({ format: 'd_month_y', era: 'ce', time: '24' }, 'en');
    assert.ok(en.dates.includes('28 September 2026'));
    assert.deepEqual(en.times, ['12:59', '10:58', '23:59']);
    assert.deepEqual(dateWidthSamples({ format: 'dmy_slash', era: 'ce', time: '24' }, 'th').dates.slice(0, 1), ['28/01/2026']);
});
