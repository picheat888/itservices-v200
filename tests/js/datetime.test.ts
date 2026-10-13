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
