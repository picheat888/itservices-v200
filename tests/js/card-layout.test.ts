// Role Template card model: the server layout must reproduce today's count specs, cascade edges and lock states.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cardCountSpec, cardRows, type CardLayout } from '../../resources/js/modules/permission/lib/card-layout.ts';
import { specEdges } from '../../resources/js/modules/permission/lib/draft-rebase.ts';
import type { CountSpec } from '../../resources/js/modules/permission/lib/permission-count.ts';
import { TREE_COUNT } from '../../resources/js/modules/permission/lib/permission-specs.ts';

const layout: CardLayout[] = JSON.parse(readFileSync(join(import.meta.dirname, '../Fixtures/permission-layout.json'), 'utf8'));
const card = (module: string): CardLayout => {
    const found = layout.find((c) => c.module === module);
    assert.ok(found, `card ${module} missing`);
    return found;
};
const holds = (keys: string[]) => (key: string) => keys.includes(key);

// Structure only: look fields dropped, childless groups folded into gated (same count and cascade), arrays sorted
const normalize = (spec: CountSpec) => {
    const group = (g: { view: string; children: string[]; fillOnGrant?: boolean }) => ({
        view: g.view,
        children: [...g.children].sort(),
        fillOnGrant: g.fillOnGrant === true,
    });
    const byView = (a: { view: string }, b: { view: string }) => a.view.localeCompare(b.view);
    const groups = (spec.groups ?? []).map(group);
    return {
        master: spec.master,
        groups: groups.filter((g) => g.children.length > 0).sort(byView),
        gated: [...(spec.gated ?? []), ...groups.filter((g) => g.children.length === 0).map((g) => g.view)].sort(),
        standalone: (spec.standalone ?? []).map(group).sort(byView),
        free: [...(spec.free ?? [])].sort(),
    };
};

const treeModules = Object.keys(TREE_COUNT);

test("the count spec of every tree card equals today's spec", () => {
    for (const module of treeModules) {
        assert.deepEqual(normalize(cardCountSpec(card(module))), normalize(TREE_COUNT[module]), module);
    }
});

test('rebase edges are unchanged', () => {
    const sorted = (spec: CountSpec) =>
        specEdges(spec)
            .map((e) => `${e.parent}>${e.child}`)
            .sort();
    for (const module of treeModules) {
        assert.deepEqual(sorted(cardCountSpec(card(module))), sorted(TREE_COUNT[module]), module);
    }
});

test('ticket self-service stays usable with the master off', () => {
    const rows = cardRows(card('tickets'), holds(['tickets.create']), false).cells.flatMap((c) => c.rows);
    const get = (key: string) => rows.find((r) => r.key === key);
    assert.deepEqual([get('tickets.create')?.on, get('tickets.create')?.locked], [true, false]);
    assert.equal(get('tickets.edit_own')?.locked, false);
    assert.equal(get('tickets.view_all')?.locked, true);
    assert.equal(get('tickets.view_all')?.lockedBy, 'tickets.module');
});

test('a child waits on its group view', () => {
    const rows = cardRows(card('stock'), holds(['stock.module']), false).cells.flatMap((c) => c.rows);
    const del = rows.find((r) => r.key === 'stock.delete');
    assert.equal(del?.locked, true);
    assert.equal(del?.lockedBy, 'stock.view');
});

test('a role-wide lock locks every row and names no switch', () => {
    const rows = cardRows(card('tickets'), holds(['tickets.module']), true).cells.flatMap((c) => c.rows);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.locked && r.lockedBy === null));
});
