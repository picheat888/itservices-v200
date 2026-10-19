// Role Templates cards hold the same permission trees as the server (tests/Fixtures/permission-trees.json, pinned by PermissionTreeSnapshotTest).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { CountSpec } from '../../resources/js/modules/permission/lib/permission-count.ts';
import {
    ACCESS_COUNT,
    ASSET_COUNT,
    CONTRACT_COUNT,
    EMPLOYEE_COUNT,
    NOTIFICATION_COUNT,
    REPORT_COUNT,
    REQUEST_COUNT,
    STOCK_COUNT,
    TICKET_COUNT,
    WORKFLOW_COUNT,
} from '../../resources/js/modules/permission/lib/permission-specs.ts';

type Tree = { master: string; keys: string[]; parents: Record<string, string> };

const fixture: Record<string, Tree> = JSON.parse(readFileSync(join(import.meta.dirname, '../Fixtures/permission-trees.json'), 'utf8'));

const cards: Record<string, CountSpec> = {
    stock: STOCK_COUNT,
    employees: EMPLOYEE_COUNT,
    access: ACCESS_COUNT,
    contracts: CONTRACT_COUNT,
    assets: ASSET_COUNT,
    tickets: TICKET_COUNT,
    requests: REQUEST_COUNT,
    workflows: WORKFLOW_COUNT,
    notifications: NOTIFICATION_COUNT,
    reports: REPORT_COUNT,
};

/** A card's spec in the fixture's shape: its master, every key it shows, and the key each child depends on. */
function cardTree(spec: CountSpec): Tree {
    const keys = [spec.master ?? '', ...(spec.gated ?? []), ...(spec.free ?? [])];
    const parents: Record<string, string> = {};
    for (const group of [...(spec.groups ?? []), ...(spec.standalone ?? [])]) {
        keys.push(group.view, ...group.children);
        for (const child of group.children) parents[child] = group.view;
    }
    return { master: spec.master ?? '', keys: [...keys].sort(), parents: Object.fromEntries(Object.entries(parents).sort()) };
}

/** PHP writes an empty map as []. */
const serverTree = (tree: Tree): Tree => ({ ...tree, parents: Array.isArray(tree.parents) ? {} : tree.parents });

test('every server tree has a card and every card a server tree', () => {
    assert.deepEqual(Object.keys(cards).sort(), Object.keys(fixture).sort());
});

for (const [module, spec] of Object.entries(cards)) {
    test(`the ${module} card shows the server's ${module} tree`, () => {
        assert.deepEqual(cardTree(spec), serverTree(fixture[module]));
    });
}
