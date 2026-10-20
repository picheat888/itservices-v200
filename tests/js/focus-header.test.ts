// Dialogs that once copied FocusDialogHeader by hand now render the shared header (D3).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');

const FILES = [
    'modules/asset/components/asset-form-drawer.tsx',
    'modules/asset/components/asset-detail-drawer.tsx',
    'modules/asset/components/contract-peek-dialog.tsx',
];

test('the asset form, asset detail and contract peek use the shared focus header', () => {
    for (const rel of FILES) {
        const src = read(rel);
        assert.match(src, /<FocusDialogHeader\b/, `${rel}: FocusDialogHeader`);
        assert.doesNotMatch(src, /tracking-\[0\.14em\]/, `${rel}: hand-made eyebrow`);
        assert.doesNotMatch(src, /<DialogTitle\b/, `${rel}: hand-made title`);
    }
});

test('the detail headers keep their chips, status and dates in the shared slots', () => {
    for (const rel of FILES.slice(1)) {
        const src = read(rel);
        assert.match(src, /titleSuffix=/, `${rel}: chips after the code`);
        assert.match(src, /headerRight=/, `${rel}: status and dates on the right`);
    }
});

test('the header icon has no tile: a 32px line icon coloured by meaning', () => {
    const src = read('shared/components/dialog-header.tsx');
    assert.doesNotMatch(src, /'bg-brand\/10 text-brand'/, 'tinted tile behind the icon');
    assert.match(src, /export type HeaderTone = 'brand' \| 'danger' \| 'warn' \| 'success'/);
    for (const pair of [
        /brand: 'text-brand'/,
        /danger: 'text-destructive'/,
        /warn: 'text-amber-600 dark:text-amber-400'/,
        /success: 'text-emerald-600 dark:text-emerald-400'/,
    ]) {
        assert.match(src, pair);
    }
    assert.match(src, /'h-8 w-8'/, '32px icon');
    assert.match(src, /strokeWidth=\{1\.75\}/);
});

test('dialogs that cannot be undone show a red header icon', () => {
    for (const rel of [
        'modules/contract/components/contract-cancel-dialog.tsx',
        'modules/request/components/cancel-request-dialog.tsx',
        'modules/asset/components/asset-writeoff-dialog.tsx',
    ]) {
        assert.match(read(rel), /tone="danger"/, rel);
    }
    assert.match(read('modules/request/components/decision-dialog.tsx'), /tone=\{rejecting \? 'danger' : 'brand'\}/);
    assert.match(read('modules/ticket/components/resolve-ticket-modal.tsx'), /tone=\{isComplete \? 'brand' : 'danger'\}/);
});

test('the asset type icon is a hook so a header can take it as its icon', () => {
    assert.match(read('modules/asset/components/asset-meta.tsx'), /export function useAssetTypeIcon\(type: AssetType\): LucideIcon/);
});
