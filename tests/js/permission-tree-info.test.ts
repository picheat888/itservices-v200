// Role Templates: every module card passes its permissions' descriptions to the (i) beside each switch.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = join(import.meta.dirname, '../../resources/js/modules/permission/components');
const cards = readdirSync(dir).filter((f) => f.endsWith('-permission-tree.tsx') || f === 'module-permission-card.tsx');

test('there are module cards to check', () => {
    assert.ok(cards.length >= 10);
});

for (const file of cards) {
    test(`${file} shows the (i) descriptions`, () => {
        const source = readFileSync(join(dir, file), 'utf8');
        assert.match(source, /actionDescription\(/);
        assert.match(source, /info[=:]/);
    });
}
