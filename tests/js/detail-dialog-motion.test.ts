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
    assert.match(requestDetail, /<div className="motion-content-in space-y-4">\s*<IssueTrail/);
    assert.match(requestDetail, /return <div className="motion-content-in">\{children\}<\/div>;/);
    assert.match(movements, /<div className="motion-content-in">\s*<LotsDrawnCard/);
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
    assert.match(hooks, /qc\.prefetchQuery\(\{ queryKey, queryFn, staleTime: FRESH_MS \}\)/);
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

test('the count skeleton is as tall as its sheet: measured row heights, the differing-line count, and the footer bar', () => {
    assert.match(countParts, /const ROW_H = \{ sheet: 'h-\[53px\]', done: 'h-\[49px\]' \} as const;/);
    assert.match(countParts, /listed\?\.differing_lines \?\? SKELETON_ROWS\.doneFallback/);
    assert.match(countParts, /<DialogFooterBar aria-hidden>/);
    assert.match(countSheet, /<CountDialogPending kind="sheet"/);
    assert.match(countDone, /<CountDialogPending kind="done"/);
});
