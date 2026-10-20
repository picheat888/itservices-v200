// Menu and secondary text tones (board W step 1): one step more contrast in both themes, the Blade error pages kept in step.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const css = readFileSync(join(import.meta.dirname, '../../resources/css/app.css'), 'utf8');
const blade = readFileSync(join(import.meta.dirname, '../../resources/views/errors/layout.blade.php'), 'utf8');

// Body of the first block that opens with this selector
const block = (src: string, selector: string): string => {
    const at = src.indexOf(`${selector} {`);
    assert.ok(at >= 0, `${selector} block`);
    return src.slice(at, src.indexOf('}', at));
};
const token = (body: string, name: string): string => {
    const m = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
    assert.ok(m, `--${name}`);
    return m[1].trim();
};

const LIGHT = { 'sidebar-foreground': 'hsl(215, 22%, 28%)', 'muted-foreground': 'hsl(215, 17%, 39%)' };
const DARK = { 'sidebar-foreground': 'hsl(215, 18%, 77%)', 'muted-foreground': 'hsl(215, 16%, 71%)' };

test('menu and secondary text are one step stronger in light mode', () => {
    const root = block(css, ':root');
    for (const [name, value] of Object.entries(LIGHT)) assert.equal(token(root, name), value, `light --${name}`);
});

test('menu and secondary text are one step stronger in dark mode', () => {
    const dark = block(css, '.dark');
    for (const [name, value] of Object.entries(DARK)) assert.equal(token(dark, name), value, `dark --${name}`);
});

test('the Blade error pages use the same secondary text tone as the app', () => {
    assert.equal(token(block(blade, ':root'), 'muted-foreground'), LIGHT['muted-foreground']);
    for (const m of blade.matchAll(/--muted-foreground:\s*([^;]+);/g)) {
        assert.ok([LIGHT['muted-foreground'], DARK['muted-foreground']].includes(m[1].trim()), `blade tone ${m[1]}`);
    }
});
