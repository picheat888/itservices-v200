// Column widths that narrow with the screen: full on a wide screen, the minimum on a small one, and the request list fitting a 1440px screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { narrowingWidth } from '../../resources/js/shared/lib/column-width.ts';

/** What the clamp() from narrowingWidth works out to on a screen this wide. */
function widthOn(css: string, screen: number): number {
    const [, min, full, from, perPx] = css.match(/^clamp\((\d+)px, calc\((\d+)px - \((\d+)px - 100vw\) \* ([\d.]+)\), \2px\)$/)!.map(Number);
    return Math.min(full, Math.max(min, full - (from - screen) * perPx));
}

test('a narrowing width is full from its wide screen up and its minimum from its small screen down', () => {
    const css = narrowingWidth(180, 130, 1686, 1440);
    assert.equal(css, 'clamp(130px, calc(180px - (1686px - 100vw) * 0.2033), 180px)');
    assert.equal(widthOn(css, 1920), 180);
    assert.equal(widthOn(css, 1686), 180);
    assert.equal(Math.round(widthOn(css, 1563)), 155);
    assert.equal(Math.round(widthOn(css, 1440)), 130);
    assert.equal(widthOn(css, 768), 130);
});

const list = readFileSync(new URL('../../resources/js/modules/request/pages/index.tsx', import.meta.url), 'utf8');

/** The px width a request list column declares. */
function pxWidth(key: string): number {
    const start = list.indexOf(`key: '${key}'`);
    assert.ok(start >= 0, key);
    const block = list.slice(start, list.indexOf('render:', start));
    return Number(block.match(/width: '(\d+)px'/)![1]);
}

/** The widest the submitted column gets: English full month names ("28 September 2026", 110px) in cozy rows (2 × 18px). */
const WIDEST_DATE = 146;
/** The sidebar and page padding around the table's frame (on itdemo: 1087px at 1440, 1567px at 1920). */
const AROUND_FRAME = 353;

test('the request list keeps every column in view from a 1440px screen up and its old widths on a wide one', () => {
    const [, from, to] = list.match(/const listColumn = \(full: number, min: number\) => narrowingWidth\(full, min, (\d+), (\d+)\);/)!.map(Number);
    const narrowing = [...list.matchAll(/(?:width|minWidth): listColumn\((\d+), (\d+)\)/g)].map((m) => ({ full: Number(m[1]), min: Number(m[2]) }));
    assert.deepEqual(
        narrowing.map((c) => c.full),
        [224, 180, 176, 200],
    );
    const viewButton = Number(list.match(/can_approve\) \? '[^']+' : '(\d+)px'/)![1]);
    const fixed = pxWidth('reference') + pxWidth('workflow') + pxWidth('status') + viewButton + WIDEST_DATE;
    const sum = (pick: (c: { full: number; min: number }) => number) => narrowing.reduce((total, c) => total + pick(c), 0);
    // Full widths from the screen that holds them, minimum widths still inside the frame at the smallest screen
    assert.equal(fixed + sum((c) => c.full) + AROUND_FRAME, from);
    assert.ok(fixed + sum((c) => c.min) <= to - AROUND_FRAME, `${fixed + sum((c) => c.min)} > ${to - AROUND_FRAME}`);
});

test("the new-employee badge under a narrowed requester cuts its label rather than cross the column's edge", () => {
    assert.match(
        list,
        /<StatusBadge tone=\{REQUEST_ONBOARDING_BADGE\.tone\} className="mt-1 max-w-full">\s*<span className="min-w-0 truncate">\{t\(REQUEST_ONBOARDING_BADGE\.labelKey\)\}<\/span>/,
    );
});
