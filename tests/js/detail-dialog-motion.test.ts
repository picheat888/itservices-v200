// Stock detail dialogs open smoothly: one fixed centered height, skeletons shaped like the content, late content fades in, rows read ahead.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const dialogUi = read('resources/js/shared/ui/dialog.tsx');
const table = read('resources/js/shared/components/data-table.tsx');
const css = read('resources/css/app.css');
const hooks = read('resources/js/modules/stock/hooks/use-stock.ts');
const requestDetail = read('resources/js/modules/stock/components/request-detail-dialog.tsx');
const movements = read('resources/js/modules/stock/pages/tabs/movements-tab.tsx');
const requests = read('resources/js/modules/stock/pages/tabs/requests-tab.tsx');
const counting = read('resources/js/modules/stock/pages/tabs/counting-tab.tsx');
const countDone = read('resources/js/modules/stock/components/count/count-done-dialog.tsx');
const countSheet = read('resources/js/modules/stock/components/count/count-sheet-dialog.tsx');
const countParts = read('resources/js/modules/stock/components/count/count-dialog-parts.tsx');

test('detail dialogs keep one fixed height and stay centered, so arriving data never moves them', () => {
    assert.match(dialogUi, /const detailDialogHeightClass = 'h-\[min\(720px,calc\(100dvh-72px\)\)\]';/);
    assert.doesNotMatch(dialogUi, /topAnchoredDialogClass/);
    assert.match(dialogUi, /top-\[50%\] left-\[50%\]/);
});

test('request and movement details are 720 high; both count sheets share the fixed 860 focus frame', () => {
    assert.match(requestDetail, /className=\{cn\(mediumDialogContentClass, detailDialogHeightClass\)\}/);
    assert.match(movements, /<FormDialogContent className=\{detailDialogHeightClass\}>/);
    assert.match(countDone, /cn\(focusDialogContentClass, !shown && pendingFrameClass\(missing\)\)/);
    assert.match(countSheet, /cn\(focusDialogContentClass, !shown && pendingFrameClass\(missing\)\)/);
    assert.doesNotMatch(countDone, /largeDialogContentClass/);
});

test('skeletons have the shape of what replaces them, not one grey block', () => {
    assert.doesNotMatch(requestDetail, /<Skeleton className="h-40 w-full" \/>/);
    assert.doesNotMatch(requestDetail, /<Skeleton className="h-24 w-full" \/>/);
    assert.match(requestDetail, /<TrailSkeleton \/>/);
    assert.match(requestDetail, /skeleton=\{<SkeletonTable heads=/);
    assert.doesNotMatch(movements, /<Skeleton className="h-32 w-full rounded-xl" \/>/);
    assert.match(movements, /<LotCardSkeleton \/>/);
    assert.match(movements, /<LotsDrawnSkeleton kind=/);
    assert.match(countParts, /eyebrow=\{listed\?\.reference \?\? t\('stock'\)\}/);
    assert.match(counting, /const pending = \{[^}]*listed \}/);
});

test('content that lands after its skeleton fades in', () => {
    assert.match(css, /\.motion-content-in \{\s*animation: fade-in-only 160ms var\(--ease-enter\);/);
    assert.match(requestDetail, /<div className="motion-content-in flex min-h-0 flex-col gap-4">\s*<IssueTrail/);
    assert.match(requestDetail, /return <div className="motion-content-in flex min-h-0 flex-col">\{children\}<\/div>;/);
    assert.match(movements, /cn\(\s*'motion-content-in flex flex-col',\s*moveLotsQuery\.data\.lots\.length > 3 \? 'min-h-56' : 'shrink-0',?\s*\)/);
    assert.match(countSheet, /<DialogBody className="motion-content-in /);
    assert.match(countDone, /<DialogBody className="motion-content-in /);
});

test('a row pointed at, touched or focused reads its detail ahead; a passing mouse does not', () => {
    assert.match(table, /export const ROW_INTENT_MS = 120;/);
    assert.match(table, /if \(e\.pointerType !== 'mouse'\) return;/);
    assert.match(table, /onPointerLeave: \(\) => window\.clearTimeout\(intentTimer\.current\)/);
    assert.match(table, /onPointerDown: \(\) => onRowIntent\(row\)/);
    assert.match(requests, /onRowIntent=\{\(r\) => prefetch\.request\(r, can\('view'\)\)\}/);
    assert.match(movements, /onRowIntent=\{prefetch\.movement\}/);
    assert.match(counting, /onRowIntent=\{\(s\) => prefetch\.count\(s\.id\)\}/);
});

test('prefetch reads the same cache entries the dialogs read, and nothing fresher than five seconds again', () => {
    assert.match(hooks, /qc\.prefetchQuery\(\{ queryKey, queryFn, staleTime: FRESH_MS, retry: false, meta: \{ quietServerError: true \} \}\)/);
    assert.match(hooks, /read\(NEW_REQUEST_DETAIL\.key\(r\.id\)/);
    assert.match(hooks, /read\(\[\.\.\.REQUESTS, 'trail', r\.id\]/);
    assert.match(hooks, /read\(\[\.\.\.ITEMS, 'detail', r\.stock_item_id\]/);
    assert.match(hooks, /read\(\[\.\.\.MOVEMENTS, 'serials', m\.id\]/);
    assert.match(hooks, /read\(\[\.\.\.MOVEMENTS, 'lots', m\.id\]/);
    assert.match(hooks, /count: \(id: number\) => read\(\[\.\.\.COUNTS, id\]/);
    // The keys the dialogs' own hooks use
    assert.match(hooks, /queryKey: \[\.\.\.REQUESTS, 'trail', id\]/);
    assert.match(hooks, /queryKey: \[\.\.\.ITEMS, 'detail', id\]/);
    assert.match(hooks, /queryKey: \[\.\.\.MOVEMENTS, 'serials', id\]/);
    assert.match(hooks, /queryKey: \[\.\.\.MOVEMENTS, 'lots', id\]/);
    assert.match(hooks, /queryKey: \[\.\.\.COUNTS, id\]/);
});

test('a hover read that fails never takes over the screen: the error screen waits for a query the user opened', () => {
    const http = read('resources/js/shared/lib/http.ts');
    assert.match(http, /event\.query\.meta\?\.quietServerError === true/);
    assert.match(hooks, /retry: false, meta: \{ quietServerError: true \}/);
});

test('the Lot table leaves the Lot number its full width in the 560 detail: narrow padding and number columns', () => {
    const lots = read('resources/js/modules/stock/components/lots-drawn-card.tsx');
    // 467px table minus 96 + 56 + 64 + 112 leaves 139px; LOT-YYYYMMDD-NNNN with its new-tab icon and padding takes 131px, "Returned" 61px
    assert.match(
        lots,
        /<col \/>\s*<col className="w-24" \/>\s*<col className="w-14" \/>\s*\{isIssue && <col className="w-16" \/>\}\s*<col className="w-28" \/>/,
    );
    assert.match(lots, /const TH = 'px-2 py-1\.5 font-medium';/);
    assert.doesNotMatch(lots, /px-3/);
});

test('the count skeleton is as tall as its sheet: measured row heights, the differing-line count, and the footer bar', () => {
    assert.match(countParts, /const ROW_H = \{ sheet: 'h-\[53px\]', done: 'h-\[49px\]' \} as const;/);
    assert.match(countParts, /listed\?\.differing_lines \?\? SKELETON_ROWS\.doneFallback/);
    assert.match(countParts, /<DialogFooterBar aria-hidden>/);
    assert.match(countSheet, /<CountDialogPending kind="sheet"/);
    assert.match(countDone, /<CountDialogPending kind="done"/);
});

test('rows scroll in their own box under a header strip, so the scrollbar never runs beside the header', () => {
    const scrollTable = read('resources/js/shared/components/scroll-table.tsx');
    // The visible header is its own non-scrolling strip with the same scrollbar gutter as the rows
    assert.match(scrollTable, /<div aria-hidden className=\{cn\('shrink-0 overflow-hidden \[scrollbar-gutter:stable\]', TABLE_HEAD\)\}>/);
    assert.match(scrollTable, /<div ref=\{bodyRef\} className="min-h-0 overflow-auto overscroll-contain \[scrollbar-gutter:stable\]">/);
    // The data table keeps real column headers for screen readers
    assert.match(scrollTable, /<th key=\{i\} scope="col" className="h-0 border-0 p-0">\s*<span className="sr-only">\{h\.label\}<\/span>/);
    for (const [name, file] of [
        ['request detail', requestDetail],
        ['movements', movements],
        ['count sheet', countSheet],
        ['count done', countDone],
        ['count skeleton', countParts],
        ['lots drawn', read('resources/js/modules/stock/components/lots-drawn-card.tsx')],
    ] as const) {
        assert.match(file, /<ScrollTable/, name);
        assert.doesNotMatch(file, /sticky top-0/, name);
    }
});

test('a table of up to three rows keeps its full height; a longer one shrinks to about three rows before the body scrolls', () => {
    assert.match(requestDetail, /const ROOMY_ROWS = 3;/);
    assert.match(requestDetail, /rows > ROOMY_ROWS \? cn\('flex min-h-0 flex-col', min\) : 'flex shrink-0 flex-col'/);
    assert.match(requestDetail, /scrollSection\(issue\.lines\.length, 'min-h-64'\)/);
    assert.match(requestDetail, /scrollSection\(returnRows, 'min-h-52'\)/);
    assert.match(movements, /moveSerials\.length > 3 \? 'min-h-40' : 'shrink-0'/);
});
