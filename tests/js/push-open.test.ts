// Clicking a push: the message the service worker sends an open tab, and where the app goes for it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pushOpenMessage, pushOpenTarget } from '../../resources/js/modules/notification/lib/push-open.ts';

const ORIGIN = 'https://itsd.example';

test('the worker asks the tab to open a url', () =>
    assert.deepEqual(pushOpenMessage(`${ORIGIN}/tickets?dialog=ticket&id=9`), { type: 'open', url: `${ORIGIN}/tickets?dialog=ticket&id=9` }));

test('a page target is routed in the app with its query and hash', () =>
    assert.deepEqual(pushOpenTarget(pushOpenMessage(`${ORIGIN}/tickets?dialog=ticket&id=9#top`), ORIGIN), {
        kind: 'path',
        to: '/tickets?dialog=ticket&id=9#top',
    }));

test('the stacked push opens the bell over the page in view', () =>
    assert.deepEqual(pushOpenTarget(pushOpenMessage(`${ORIGIN}/?bell=1`), ORIGIN), { kind: 'bell' }));

test('the bell plus anything else is an ordinary target', () =>
    assert.deepEqual(pushOpenTarget(pushOpenMessage(`${ORIGIN}/?bell=1&dialog=x`), ORIGIN), { kind: 'path', to: '/?bell=1&dialog=x' }));

test('the home page opens as a page', () => assert.deepEqual(pushOpenTarget(pushOpenMessage(`${ORIGIN}/`), ORIGIN), { kind: 'path', to: '/' }));

test('another origin is ignored', () => assert.equal(pushOpenTarget(pushOpenMessage('https://evil.test/tickets'), ORIGIN), null));

test('anything but an open message is ignored', () => {
    assert.equal(pushOpenTarget(null, ORIGIN), null);
    assert.equal(pushOpenTarget('open', ORIGIN), null);
    assert.equal(pushOpenTarget({ type: 'wording', url: `${ORIGIN}/` }, ORIGIN), null);
    assert.equal(pushOpenTarget({ type: 'open', url: 42 }, ORIGIN), null);
    assert.equal(pushOpenTarget({ type: 'open', url: 'http://[bad' }, ORIGIN), null);
});
