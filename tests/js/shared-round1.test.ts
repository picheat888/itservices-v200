// Shared round 1 (UI-5 UI-6 UI-11 + DataTable and UI store): pre-paint dark mode, touch tap areas, layer rule.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

function filesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
}

// Runs the Blade shell's inline theme script against a fake localStorage and <html>
function runThemeScript(saved: string | null): string[] {
    const blade = read('views/app.blade.php');
    const script = blade.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
    const classes: string[] = [];
    const document = { documentElement: { classList: { add: (name: string) => classes.push(name) } } };
    const localStorage = { getItem: () => saved };
    new Function('document', 'localStorage', script)(document, localStorage);
    return classes;
}

test('the shell puts the saved dark mode on <html> before the bundle loads', () => {
    assert.deepEqual(runThemeScript(JSON.stringify({ state: { dark: true } })), ['dark']);
    assert.deepEqual(runThemeScript(JSON.stringify({ state: { dark: false } })), []);
    assert.deepEqual(runThemeScript(null), []);
    assert.deepEqual(runThemeScript('not json'), []);

    const blade = read('views/app.blade.php');
    assert.ok(blade.indexOf('itservices-ui') < blade.indexOf('@vite('), 'theme script runs before the bundle');
});

test('touch-hit gives a 40px tap area on touch screens only', () => {
    const utility = read('css/app.css').match(/@utility touch-hit \{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(utility, /@media \(pointer: coarse\)/);
    assert.match(utility, /width: max\(100%, 40px\)/);
    assert.match(utility, /height: max\(100%, 40px\)/);
});

test('small shared controls and every row menu use touch-hit', () => {
    const count = (rel: string) => read(rel).match(/touch-hit/g)?.length ?? 0;
    assert.equal(count('js/shared/components/data-table.tsx'), 3, 'prev, next and rows per page');
    assert.equal(count('js/shared/components/filter-popover.tsx'), 1, 'clear all');
    assert.equal(count('js/shared/ui/switch.tsx'), 1);

    let rowMenus = 0;
    for (const file of filesUnder(join(root, 'js/modules'))) {
        const source = readFileSync(file, 'utf8');
        for (const button of source.match(/<button[^>]*>\s*<MoreVertical/g) ?? []) {
            assert.match(button, /touch-hit/, file);
            rowMenus++;
        }
    }
    assert.equal(rowMenus, 7);
});

test('shared and stores do not import from modules or app', () => {
    for (const dir of ['js/shared', 'js/stores']) {
        for (const file of filesUnder(join(root, dir))) {
            assert.doesNotMatch(readFileSync(file, 'utf8'), /from '@\/(modules|app)(\/|')/, file);
        }
    }
});

test('the table empty state counts pinned rows and the page never drops below 1', () => {
    const table = read('js/shared/components/data-table.tsx');
    assert.match(table, /!loading && drawnRows\.length === 0/);
    assert.match(table, /const safePage = Math\.max\(1,/);
});

test('a saved UI copy lays over the defaults and its date setting is normalised', () => {
    const store = read('js/stores/ui.ts');
    assert.match(store, /merge: \(persisted, current\)/);
    assert.match(store, /assetStatusColors: \{ \.\.\.current\.assetStatusColors, \.\.\.saved\.assetStatusColors \}/);
    assert.match(store, /dateConfig: normalizeDateConfig\(saved\.dateConfig\)/);
});
