// STK-10: the item history page shows not-found and load-failed instead of a lasting skeleton.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const src = readFileSync(join(import.meta.dirname, '../../resources/js/modules/stock/pages/item-history.tsx'), 'utf8');

test('item history reads error and refetch from the query', () => {
    assert.match(src, /const \{ data, isLoading, error, refetch \} = useStockItemHistory\(/);
});

test('item history shows not-found on 404 and load-failed on other errors, before the skeleton', () => {
    const notFound = src.indexOf('httpStatus(error) === 404');
    const failed = src.indexOf('<LoadFailedPanel onRetry={() => refetch()} />');
    const skeleton = src.indexOf('if (isLoading || !data)');
    assert.ok(notFound > 0 && failed > notFound && skeleton > failed);
    assert.match(src, /<NotFoundPage \/>/);
    assert.match(src, /error && !data/);
    assert.match(src, /import NotFoundPage from '@\/app\/not-found'/);
    assert.match(src, /import \{ LoadFailedPanel \} from '@\/shared\/components\/load-failed'/);
    assert.match(src, /import \{ httpStatus \} from '@\/shared\/lib\/http-errors'/);
});
