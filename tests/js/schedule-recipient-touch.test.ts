// The schedule dialog's recipient X grows to 24px on touch screens, as the Workflow editor's person chips do.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync('resources/js/modules/report/components/schedule-report-dialog.tsx', 'utf8');

test('the recipient remove button is 24px on touch and its chip 32px tall', () => {
    const button = source.match(/aria-label=\{t\('rep_schedule_recipient_remove'\)[^]*?className="([^"]+)"/)?.[1] ?? '';
    assert.match(button, /\btouch:size-6\b/);
    assert.match(source, /'touch:min-h-8 [^']*inline-flex items-center gap-1 rounded-full/);
});
