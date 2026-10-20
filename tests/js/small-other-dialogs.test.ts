// Type-6 small dialogs outside the small-form shell: record missing (centred alert look), photo crop and stock movement detail (4ข header and footer).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');

const MISSING = 'shared/components/record-missing.tsx';
const CROP = 'modules/employee/components/photo-crop-dialog.tsx';
const MOVES = 'modules/stock/pages/tabs/movements-tab.tsx';

test('record missing uses the centred alert frame: 384 wide, 14px corners, no close cross', () => {
    const frame =
        read(MISSING)
            .match(/export const recordMissingContentClass = '([^']*)'/)?.[1]
            .split(/\s+/) ?? [];
    for (const t of ['h-auto', 'max-w-sm', 'w-[calc(100vw-2rem)]', 'rounded-[14px]', 'sm:rounded-[14px]', 'shadow-2xl', '[&>button]:hidden']) {
        assert.ok(frame.includes(t), `frame: ${t}`);
    }
    assert.ok(!frame.includes('max-w-[440px]'), 'frame: old 440 width');
});

test('record missing shows a grey round icon and one full-width Close button', () => {
    const src = read(MISSING);
    assert.match(src, /<AlertIconCircle icon=\{FileQuestion\} tone="neutral" \/>/);
    assert.doesNotMatch(src, /rounded-2xl|h-14 w-14/, 'old grey square');
    assert.match(src, /<Button[^>]*className="w-full font-semibold" onClick=\{onClose\}>/);
    assert.doesNotMatch(src, /variant="outline"/, 'old outline Close');
});

test('record missing moves focus to Close when it replaces an open dialog body, since the hidden cross drops it', () => {
    assert.match(read(MISSING), /<Button autoFocus className="w-full font-semibold"/);
});

const tsxFiles = (dir: string): string[] =>
    readdirSync(join(import.meta.dirname, '../../resources/js', dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
    );

test('every dialog that shows the record-missing panel as its body switches to the alert frame', () => {
    const hosts = tsxFiles('modules').filter((rel) => /<RecordMissing\s/.test(read(rel)));
    assert.ok(hosts.length >= 3, 'request, stock item and stock count hosts found');
    for (const rel of hosts) assert.match(read(rel), /recordMissingContentClass/, `${rel}: alert frame`);
});

test('the stock count sheet shows record missing alone, without its own loading title above it', () => {
    const src = read('modules/stock/pages/tabs/counting-tab.tsx');
    assert.match(src, /\) : sessionMissing \? \(\s*<RecordMissing onClose=\{closeSheet\} \/>\s*\) : \(/);
});

test('photo crop keeps its 384 frame without a cross, and takes the 4ข header and footer bar', () => {
    const src = read(CROP);
    assert.match(src, /<DialogContent className="[^"]*max-w-sm[^"]*\[&>button\]:hidden/);
    assert.match(
        src,
        /<FocusDialogHeader\s+icon=\{Crop\}\s+eyebrow=\{t\('employees'\)\}\s+title=\{t\('photo_crop_title'\)\}\s+srDescription=\{t\('photo_crop_hint'\)\}/,
    );
    assert.match(src, /<DialogFooterBar\b/);
    assert.doesNotMatch(src, /size="sm"/, 'small footer buttons');
});

test('stock movement detail is 560 with the 4ข header: doc number on top, date on the right, reference below', () => {
    const src = read(MOVES);
    const dialog = src.slice(src.indexOf('open={moveOpen}'));
    assert.match(dialog, /<FormDialogContent\b/);
    assert.doesNotMatch(dialog.slice(0, dialog.indexOf('</Dialog>')), /<DialogHeader\b|max-w-md/, 'old frame');
    const header = dialog.match(/<FocusDialogHeader\b[\s\S]*?\/>/)?.[0] ?? '';
    assert.match(header, /icon=\{meta\.icon\}/);
    assert.match(header, /accent=\{MV_TONE_HEX\[meta\.tone\]\}/);
    assert.match(header, /eyebrow=\{viewMove\.doc_no \?\? '—'\}/);
    assert.match(header, /headerRight=/);
    assert.match(header, /subtitle=/);
    assert.match(dialog, /<DialogBody\b/);
});

test('each movement tone has a hex accent for the header tile', () => {
    const shared = read('modules/stock/pages/shared.ts');
    assert.match(shared, /export const MV_TONE_HEX: Record<MovementTone, string> = \{/);
    for (const tone of ['green', 'violet', 'blue', 'amber']) assert.match(shared, new RegExp(`MV_TONE_HEX[\\s\\S]*${tone}: '#[0-9a-f]{6}'`), tone);
});
