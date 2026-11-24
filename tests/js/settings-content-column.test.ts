// Settings card: the content column may shrink below its widest row, so Master data fits an iPad mini in landscape (1024px).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync(new URL('../../resources/js/modules/settings/pages/index.tsx', import.meta.url), 'utf8');

test('the settings card gives its content column a zero minimum, not the tab strip width', () => {
    assert.match(page, /<Card className="[^"]*lg:grid-cols-\[220px_minmax\(0,1fr\)\][^"]*">/);
    assert.doesNotMatch(page, /lg:grid-cols-\[220px_1fr\]/);
});
