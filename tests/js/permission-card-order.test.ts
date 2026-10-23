// The Role Templates cards follow the sidebar's order, so an admin finds a module where the menu has it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repo = join(import.meta.dirname, '../..');
const read = (rel: string) => readFileSync(join(repo, rel), 'utf8');

// Sidebar ids in menu order; the overview entry is the Dashboard card
const sidebar = [...read('resources/js/app/nav.ts').matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => (m[1] === 'overall' ? 'dashboard' : m[1]));
// Card modules in the order the server sends them
const cards = [...read('app/Support/PermissionLayout.php').matchAll(/self::(?:card|treeCard)\('([^']+)'/g)].map((m) => m[1]);

test('every sidebar module has a card, in the sidebar order', () => {
    assert.deepEqual(
        cards.filter((module) => sidebar.includes(module)),
        sidebar,
    );
});

test('the profile card, which has no sidebar entry, closes the workspace cards', () => {
    assert.equal(cards[cards.indexOf('stock') + 1], 'profile');
});
