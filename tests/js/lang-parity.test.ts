// Every English lang file has the same keys as its Thai twin.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';

const dir = new URL('../../resources/js/lang/', import.meta.url);

test('every en lang file has the same keys as its th twin', async () => {
    const files = readdirSync(new URL('en/', dir)).filter((name) => name.endsWith('.ts'));
    assert.ok(files.length > 0);
    for (const file of files) {
        const en = (await import(new URL(`en/${file}`, dir).href)) as Record<string, Record<string, string>>;
        const th = (await import(new URL(`th/${file}`, dir).href)) as Record<string, Record<string, string>>;
        assert.deepEqual(Object.keys(th).sort(), Object.keys(en).sort(), `${file} exports differ`);
        for (const name of Object.keys(en)) {
            assert.deepEqual(Object.keys(th[name]).sort(), Object.keys(en[name]).sort(), `${file} ${name} keys differ`);
        }
    }
});
