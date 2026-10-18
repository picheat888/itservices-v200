// A Role Template draft rebased after someone else saved keeps the reader's changes and the other save's changes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rebaseDraft, specEdges } from '../../resources/js/modules/permission/lib/draft-rebase.ts';
import type { CountSpec } from '../../resources/js/modules/permission/lib/permission-count.ts';

const STOCK: CountSpec = {
    master: 'stock.module',
    groups: [
        { view: 'stock.view', children: ['stock.receive', 'stock.delete'] },
        { view: 'stock.view_count', children: [] },
    ],
};
const TICKETS: CountSpec = {
    master: 'tickets.module',
    gated: ['tickets.level_hardware'],
    standalone: [{ view: 'tickets.create', children: ['tickets.edit_own'] }],
    free: ['tickets.my'],
};
const EDGES = [...specEdges(STOCK), ...specEdges(TICKETS)];

const set = (...keys: string[]) => new Set(keys);
const sorted = (s: Set<string>) => [...s].sort();

test('specEdges: the master over everything under it, each view over its children, standalone views outside the master', () => {
    const edges = specEdges(TICKETS).map((e) => `${e.parent}>${e.child}`);
    assert.deepEqual(edges.sort(), ['tickets.create>tickets.edit_own', 'tickets.module>tickets.level_hardware']);
    assert.ok(specEdges(STOCK).some((e) => e.parent === 'stock.module' && e.child === 'stock.receive'));
    assert.ok(specEdges(STOCK).some((e) => e.parent === 'stock.view' && e.child === 'stock.delete'));
    assert.deepEqual(specEdges({ free: ['dashboard.view'] }), []);
});

test('nothing unsaved: the draft becomes the new stored set', () => {
    const seed = set('stock.module', 'stock.view');
    const stored = set('stock.module', 'stock.view', 'stock.receive');
    assert.deepEqual(sorted(rebaseDraft(seed, seed, stored, EDGES)), ['stock.module', 'stock.receive', 'stock.view']);
});

test("the other save's removal is not undone by an untouched key", () => {
    const seed = set('stock.module', 'stock.view', 'stock.delete', 'tickets.my');
    const draft = set('stock.module', 'stock.view', 'stock.delete', 'tickets.my', 'tickets.create');
    const stored = set('stock.module', 'stock.view', 'tickets.my');
    assert.deepEqual(sorted(rebaseDraft(draft, seed, stored, EDGES)), ['stock.module', 'stock.view', 'tickets.create', 'tickets.my']);
});

test('both sides keep their adds and removals', () => {
    const seed = set('stock.module', 'stock.view', 'tickets.my');
    // Reader: + stock.receive, − tickets.my
    const draft = set('stock.module', 'stock.view', 'stock.receive');
    // Other save: + stock.view_count
    const stored = set('stock.module', 'stock.view', 'stock.view_count', 'tickets.my');
    assert.deepEqual(sorted(rebaseDraft(draft, seed, stored, EDGES)), ['stock.module', 'stock.receive', 'stock.view', 'stock.view_count']);
});

test('a switch the reader turned on brings back the parents the other save turned off', () => {
    const seed = set('stock.module', 'stock.view');
    const draft = set('stock.module', 'stock.view', 'stock.receive');
    const stored = set<string>();
    assert.deepEqual(sorted(rebaseDraft(draft, seed, stored, EDGES)), ['stock.module', 'stock.receive', 'stock.view']);
});

test("the reader's master off drops what the other save added under it", () => {
    const seed = set('stock.module', 'stock.view');
    const draft = set<string>();
    const stored = set('stock.module', 'stock.view', 'stock.delete', 'stock.view_count');
    assert.deepEqual(sorted(rebaseDraft(draft, seed, stored, EDGES)), []);
});

test("the reader's view off drops the other save's child under it; standalone keys outlive the master", () => {
    const seed = set('tickets.module', 'tickets.create', 'tickets.level_hardware');
    const draft = set('tickets.module', 'tickets.level_hardware');
    const stored = set('tickets.create', 'tickets.edit_own', 'tickets.my');
    assert.deepEqual(sorted(rebaseDraft(draft, seed, stored, EDGES)), ['tickets.my']);
});
