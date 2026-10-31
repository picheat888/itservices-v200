// Edit forms and fresh server data: untouched fields take the new values, typed ones stay, and a form seeds once per record.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { needsSeed, nextBase, rebaseForm, rebaseLinked, sameValue } from '../../resources/js/shared/lib/form-rebase.ts';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');

test('an untouched field takes the fresh server value', () => {
    const base = { a: '1', b: 'x' };
    assert.deepEqual(rebaseForm(base, { ...base }, { a: '2', b: 'x' }), { a: '2', b: 'x' });
});

test('a touched field keeps the user value even when the server changed it', () => {
    assert.deepEqual(rebaseForm({ a: '1' }, { a: 'typed' }, { a: '2' }), { a: 'typed' });
});

test('arrays compare by value', () => {
    assert.deepEqual(rebaseForm({ files: [1, 2] }, { files: [1, 2] }, { files: [1, 2, 3] }), { files: [1, 2, 3] });
});

test('skipped keys never change', () => {
    const base = { name: 'A', b: '1' };
    assert.deepEqual(rebaseForm(base, { ...base }, { name: 'B', b: '2' }, ['name']), { name: 'A', b: '2' });
});

test('a key the fresh record lacks keeps the form value', () => {
    const base: Record<string, string> = { a: '1', local: 'x' };
    assert.deepEqual(rebaseForm(base, { ...base }, { a: '1' }), { a: '1', local: 'x' });
});

test('same value treats equal objects as equal', () => {
    assert.equal(sameValue({ x: [1] }, { x: [1] }), true);
    assert.equal(sameValue('1', 1), false);
});

test('a form seeds once per record, not on every refresh of it', () => {
    assert.equal(needsSeed(null, 7), true);
    assert.equal(needsSeed(7, 7), false);
    assert.equal(needsSeed(7, 8), true);
    assert.equal(needsSeed(7, null), false);
});

test('a skipped key keeps its opening value in the base, so an untouched form stays clean', () => {
    assert.deepEqual(nextBase({ a: '1', ids: [1] }, { a: '2', ids: [1, 2] }, ['ids']), { a: '2', ids: [1] });
    assert.deepEqual(nextBase({ a: '1' }, { a: '2' }), { a: '2' });
});

function sourcesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? sourcesUnder(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
}

test('every form with skipped keys rebases only after its seed has rendered, so it opens clean', () => {
    const hook = read('shared/hooks/use-seed-once.ts');
    assert.match(hook, /seed\(\);\s*setSeededKey\(key\);/);
    assert.match(hook, /return key !== null && seededKey === key;/);

    const gated: string[] = [];
    for (const file of sourcesUnder(join(import.meta.dirname, '../../resources/js/modules'))) {
        const source = readFileSync(file, 'utf8');
        for (const call of source.match(/useFormRebase\(\{[\s\S]*?\}\);/g) ?? []) {
            if (!/\bskip:/.test(call)) continue;
            assert.match(call, /fresh: live && seeded \?/, file);
            assert.match(source, /const seeded = useSeedOnce\(/, file);
            gated.push(basename(file));
        }
    }
    assert.deepEqual(gated.sort(), ['contract-form-drawer.tsx', 'edit-ticket-drawer.tsx', 'stock-item-modal.tsx']);
});

const ORG = [{ child: 'section', parent: 'dept', empty: '' }] as const;

test('a linked pair the user never touched follows the server together', () => {
    const base = { dept: '1', section: '10', phone: '' };
    const r = rebaseLinked(base, { ...base }, { dept: '3', section: '30', phone: '' }, [], ORG);
    assert.deepEqual(r.form, { dept: '3', section: '30', phone: '' });
    assert.deepEqual(r.drops, []);
});

test('a child stays with a parent the user changed, even when the server sends a new child', () => {
    const base = { dept: '1', section: '' };
    const r = rebaseLinked(base, { dept: '4', section: '' }, { dept: '1', section: '10' }, [], ORG);
    assert.deepEqual(r.form, { dept: '4', section: '' });
    assert.deepEqual(r.drops, []);
});

test('a chosen child is taken out and reported when the server moves its parent', () => {
    const base = { dept: '1', section: '10' };
    const r = rebaseLinked(base, { dept: '1', section: '11' }, { dept: '3', section: '30' }, [], ORG);
    assert.deepEqual(r.form, { dept: '3', section: '' });
    assert.deepEqual(r.drops, [{ child: 'section', value: '11', parentValue: '3' }]);
});

test('a child the user emptied is not reported when the server moves its parent', () => {
    const base = { dept: '1', section: '10' };
    const r = rebaseLinked(base, { dept: '1', section: '' }, { dept: '3', section: '30' }, [], ORG);
    assert.deepEqual(r.form, { dept: '3', section: '' });
    assert.deepEqual(r.drops, []);
});

test('a chosen child stays when the server leaves its parent alone', () => {
    const base = { dept: '1', section: '10', phone: '1' };
    const r = rebaseLinked(base, { dept: '1', section: '11', phone: '1' }, { dept: '1', section: '12', phone: '2' }, [], ORG);
    assert.deepEqual(r.form, { dept: '1', section: '11', phone: '2' });
    assert.deepEqual(r.drops, []);
});

test('a linked pair can use null as its empty value', () => {
    const links = [{ child: 'model_id', parent: 'brand_id', empty: null }] as const;
    const base = { brand_id: 1 as number | null, model_id: 5 as number | null };
    const r = rebaseLinked(base, { brand_id: 1, model_id: 6 }, { brand_id: 2, model_id: 9 }, [], links);
    assert.deepEqual(r.form, { brand_id: 2, model_id: null });
    assert.deepEqual(r.drops, [{ child: 'model_id', value: 6, parentValue: 2 }]);
});

test('without links a linked rebase is a plain rebase', () => {
    const base = { a: '1', b: 'x' };
    const r = rebaseLinked(base, { a: '1', b: 'typed' }, { a: '2', b: 'y' });
    assert.deepEqual(r.form, rebaseForm(base, { a: '1', b: 'typed' }, { a: '2', b: 'y' }));
    assert.deepEqual(r.drops, []);
});
