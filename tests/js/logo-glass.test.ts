// The brand logo sits on frosted glass wherever its ground is coloured or dark, so a logo in the theme colour stays visible.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('logo-glass is 92% white with a blur, so the logo keeps nearly its contrast on white', () => {
    const css = read('resources/css/app.css');
    assert.match(css, /@utility logo-glass \{[^}]*background-color: rgb\(255 255 255 \/ 0\.92\);[^}]*backdrop-filter: blur\(10px\);/);
});

test('the login brand panel always frames the logo in glass', () => {
    const panel = read('resources/js/modules/auth/components/login-brand-panel.tsx');
    assert.match(panel, /className="logo-glass grid size-\[52px\] shrink-0 place-items-center rounded-\[15px\]"/);
    assert.doesNotMatch(panel, /--edge/);
});

test('the sidebar and the iPad login header add glass only on the dark ground', () => {
    assert.match(
        read('resources/js/app/layout/sidebar.tsx'),
        /src=\{logoUrl \|\| '\/logo\.svg'\}[\s\S]{0,80}className="[^"]*dark:logo-glass[^"]*dark:p-\[3px\]"/,
    );
    assert.match(
        read('resources/js/modules/auth/pages/login.tsx'),
        /className="dark:logo-glass size-16 shrink-0 object-contain dark:rounded-\[18px\] dark:p-2"/,
    );
});
