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

test('the request list keeps every column in view on a 1440px screen and its old widths on a wide one', () => {
    const src = readFileSync(new URL('../../resources/js/modules/request/pages/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /const listColumn = \(full: number, min: number\) => narrowingWidth\(full, min, 1686, 1440\);/);
    const narrowing = [...src.matchAll(/(?:width|minWidth): listColumn\((\d+), (\d+)\)/g)].map((m) => ({ full: Number(m[1]), min: Number(m[2]) }));
    assert.deepEqual(
        narrowing.map((c) => c.full),
        [224, 180, 176, 200],
    );
    // Reference 100, chain 140, status 110, view button 72 and the submitted date (131px with full Thai month names and a BE year)
    const fixed = 100 + 140 + 110 + 72 + 131;
    // The table's frame on a 1440px screen beside the sidebar
    assert.ok(fixed + narrowing.reduce((sum, c) => sum + c.min, 0) <= 1087);
    assert.equal(fixed + narrowing.reduce((sum, c) => sum + c.full, 0) + 353, 1686);
});
