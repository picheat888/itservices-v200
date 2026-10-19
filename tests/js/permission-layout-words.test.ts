// Every lang key the server layout sends (sub, notes, set labels and hints, cluster words) must exist in th and en.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { permission as enPermission } from '../../resources/js/lang/en/permission.ts';
import { permission as thPermission } from '../../resources/js/lang/th/permission.ts';

type Cell = {
    kind: string;
    label?: string;
    hint?: string | null;
    note?: string | null;
    cluster?: { title: string; hint: string | null } | null;
};
type Card = { master: { sub: string | null } | null; note: string | null; cells: Cell[] };

const layout: Card[] = JSON.parse(readFileSync(join(import.meta.dirname, '../Fixtures/permission-layout.json'), 'utf8'));

const sentKeys = (): string[] => {
    const keys: Array<string | null | undefined> = [];
    for (const card of layout) {
        keys.push(card.master?.sub, card.note);
        for (const cell of card.cells) {
            if (cell.kind === 'set') {
                keys.push(cell.label, cell.hint);
            }
            if (cell.kind === 'group') {
                keys.push(cell.note, cell.cluster?.title, cell.cluster?.hint);
            }
        }
    }
    return keys.filter((key): key is string => typeof key === 'string');
};

test('every server-sent lang key exists in th and en', () => {
    const keys = sentKeys();
    assert.ok(keys.length > 10);
    for (const key of keys) {
        assert.ok(key in thPermission, `th/permission.ts lacks ${key}`);
        assert.ok(key in enPermission, `en/permission.ts lacks ${key}`);
    }
});
