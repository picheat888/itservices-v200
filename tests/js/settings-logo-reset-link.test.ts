// Settings → System: the logo's "Reset to default" reads as a theme-coloured link with an icon, not as a grey caption.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync(new URL('../../resources/js/modules/settings/pages/index.tsx', import.meta.url), 'utf8');

const resetButton = (): string => {
    const end = page.indexOf("{t('reset_default')}");
    assert.ok(end > 0, 'reset button label not found');
    const start = page.lastIndexOf('<Button', end);
    return page.slice(start, end + "{t('reset_default')}".length);
};

test('the logo reset is a theme-coloured link with a reset icon', () => {
    const button = resetButton();
    assert.match(button, /variant="link"/);
    assert.match(button, /text-brand-ink/);
    assert.match(button, /<RotateCcw className="h-4 w-4" aria-hidden="true" \/>/);
});

test('upload and reset wrap onto two lines when the logo column is narrow (iPad)', () => {
    const row = page.lastIndexOf('<div className=', page.indexOf("{t('set_logo_upload')}"));
    assert.match(page.slice(row, row + 60), /<div className="flex flex-wrap items-center gap-2">/);
});

test('the logo reset no longer looks like small grey help text or a delete', () => {
    const button = resetButton();
    assert.doesNotMatch(button, /text-muted-foreground/);
    assert.doesNotMatch(button, /text-xs/);
    assert.doesNotMatch(button, /hover:text-destructive/);
});
