// Monitor TV priority dots use the app's own priority tones, never colours of their own.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const src = readFileSync(join(import.meta.dirname, '../../resources/js/modules/monitor/components/monitor-parts.ts'), 'utf8');

test('priority dots come from TICKET_PRIORITY_TONE and toneDots', () => {
    assert.match(src, /TICKET_PRIORITY_TONE/);
    assert.match(src, /toneDots/);
    assert.doesNotMatch(src, /PRIORITY_DOT|bg-orange-|bg-slate-/);
});
