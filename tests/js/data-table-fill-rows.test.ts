// A fill-height table pins real rows to the same height as its filler rows, so a short page looks like a full one instead of ballooning its few real rows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const table = readFileSync(join(import.meta.dirname, '../../resources/js/shared/components/data-table.tsx'), 'utf8');

test('real rows in a fill-height table carry the row height too', () => {
    assert.match(table, /data-row-click=\{clickable \? '' : undefined\}\s*style=\{fillHeight && rowHeight \? \{ height: rowHeight \} : undefined\}/);
});
