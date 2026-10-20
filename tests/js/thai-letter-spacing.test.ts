// Thai has no letter case: uppercase labels on a Thai page keep the surrounding letter spacing (one unlayered rule in app.css).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const css = readFileSync(join(import.meta.dirname, '../../resources/css/app.css'), 'utf8');

test('uppercase text on a Thai page does not spread its letters', () => {
    const at = css.indexOf('.uppercase:lang(th)');
    assert.ok(at >= 0, 'rule for .uppercase:lang(th) (the text itself is Thai, so an English island keeps its tracking)');
    const block = css.slice(at, css.indexOf('}', at));
    assert.doesNotMatch(css, /:lang\(th\) \.uppercase/, 'ancestor form would also strip English inside a Thai page');
    assert.match(block, /letter-spacing:\s*inherit/);
});

test('the rule sits outside every @layer, so it wins over the tracking utilities', () => {
    const at = css.indexOf('.uppercase:lang(th)');
    const before = css.slice(0, at);
    const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    assert.equal(depth, 0);
});
