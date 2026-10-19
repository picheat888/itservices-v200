// Small form dialogs (types 4ข and 4ก): the shared 560 shell, its 32px close button and footer bar, and every file that must use it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');

const OLD_LOOK = [
    /max-w-\[(480|520|540|576|600)px\]/,
    /max-w-(md|lg|xl)\b/,
    /bg-muted\/20/,
    /<DialogHeader\b/,
    /<DialogFooter\b/,
    /<DialogContent\b/,
];

function assertSmallForm(rel: string): void {
    const src = read(rel);
    assert.match(src, /<FormDialogContent\b/, `${rel}: FormDialogContent`);
    assert.match(src, /<FocusDialogHeader\b/, `${rel}: FocusDialogHeader`);
    assert.match(src, /<DialogFooterBar\b/, `${rel}: DialogFooterBar`);
    for (const re of OLD_LOOK) assert.doesNotMatch(src, re, `${rel}: still has ${re}`);
}

const TICKET_4B = [
    'modules/ticket/components/assign-ticket-modal.tsx',
    'modules/ticket/components/forward-ticket-modal.tsx',
    'modules/ticket/components/resolve-ticket-modal.tsx',
    'modules/ticket/components/take-case-modal.tsx',
    'modules/ticket/components/ticket-update-modal.tsx',
];
const REPORT_4B = ['modules/report/components/export-report-dialog.tsx', 'modules/report/components/schedule-report-dialog.tsx'];
const SETTINGS_4A: string[] = [];
const PEOPLE_4A: string[] = [];
const ASSET_4A: string[] = [];
const RECORD_4A: string[] = [];
const ALL = [...TICKET_4B, ...REPORT_4B, ...SETTINGS_4A, ...PEOPLE_4A, ...ASSET_4A, ...RECORD_4A];

test('every listed small form uses the shared shell and the 4ข header', () => ALL.forEach(assertSmallForm));

test('ticket small forms use the shared shell', () => TICKET_4B.forEach(assertSmallForm));

test('export and schedule dialogs use the shared shell and keep their own body and ghost cancel', () => {
    for (const rel of REPORT_4B) {
        assertSmallForm(rel);
        const src = read(rel);
        assert.match(src, /variant="ghost"/, `${rel}: ghost cancel`);
        assert.match(src, /px-6 pb-2/, `${rel}: body unchanged`);
        assert.doesNotMatch(src, /<DialogBody\b/, `${rel}: no hairline body`);
    }
});

test('the shared shell is 560 wide, capped, with a 32px close button and the large-dialog footer bar', () => {
    const src = read('shared/ui/dialog.tsx');
    for (const part of ['max-w-[560px]', 'max-h-[calc(100dvh-4.5rem)]', 'size-8', 'top-2 right-2', 'bg-muted/30', 'border-border/60']) {
        assert.ok(src.includes(part), `dialog.tsx: ${part}`);
    }
    assert.match(src, /export \{[^}]*\bFormDialogContent\b[^}]*\}/s);
    assert.match(src, /export \{[^}]*\bDialogBody\b[^}]*\}/s);
    assert.match(src, /export \{[^}]*\bDialogFooterBar\b[^}]*\}/s);
    // Every other dialog keeps today's close button
    assert.ok(src.includes('absolute top-4 right-4'), 'base close button unchanged');
});
