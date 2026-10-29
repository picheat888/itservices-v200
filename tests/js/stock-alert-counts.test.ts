// The stock Items tab badge counts the same alerts as the alert button (out + low + over + stale).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync('resources/js/modules/stock/pages/index.tsx', 'utf8');

test('the items tab badge includes stale items', () => {
    const match = page.match(/const itemAlerts = summary \? ([^:]+) : 0;/);
    assert.ok(match, 'itemAlerts line found');
    for (const key of ['out_count', 'low_count', 'over_count', 'dead_count']) {
        assert.ok(match[1].includes(`summary.${key}`), `${key} counted in the badge`);
    }
});
