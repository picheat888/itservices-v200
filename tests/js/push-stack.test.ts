// The service worker's one stacked OS notification: count, when it rings, what it opens and says.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { REQUEST_TYPE_LABEL_KEY } from '../../resources/js/shared/lib/request-title.ts';
import { isBellKey } from '../../resources/js/sw/bell-keys.ts';
import { isApplePush, nextStack, serialQueue, stackBody, stackTarget } from '../../resources/js/sw/stack.ts';
import { isWindowSource, sanitizeWording } from '../../resources/js/sw/wording.ts';

const more = (n: number) => `และแจ้งเตือนใหม่อีก ${n} รายการ`;

test('first push rings and opens its own target', () => {
    const s = nextStack(null, '/tickets?dialog=ticket&id=9', 1_000);
    assert.deepEqual([s.count, s.renotify, stackTarget(s)], [1, true, '/tickets?dialog=ticket&id=9']);
    assert.equal(s.lastSoundAt, 1_000);
});

test('a second push inside a minute replaces quietly and opens the bell', () => {
    const s = nextStack(nextStack(null, '/a', 0), '/b', 59_999);
    assert.deepEqual([s.count, s.renotify, stackTarget(s)], [2, false, '/?bell=1']);
    assert.equal(s.lastSoundAt, 0);
    assert.equal(s.firstTarget, '/a');
});

test('a push a minute after the last sound rings again', () => {
    const s = nextStack(nextStack(null, '/a', 0), '/b', 60_000);
    assert.deepEqual([s.count, s.renotify, s.lastSoundAt], [2, true, 60_000]);
});

test('quiet replacements do not move the minute forward', () => {
    const quiet = nextStack(nextStack(null, '/a', 0), '/b', 30_000);
    const rings = nextStack(quiet, '/c', 60_000);
    assert.deepEqual([rings.count, rings.renotify, rings.lastSoundAt], [3, true, 60_000]);
});

test('the body names how many more', () => {
    assert.equal(stackBody('X', 1, more), 'X');
    assert.equal(stackBody('X', 20, more), 'และแจ้งเตือนใหม่อีก 19 รายการ');
});

test('apple endpoints are recognised', () => {
    assert.equal(isApplePush('https://web.push.apple.com/abc'), true);
    assert.equal(isApplePush('https://fcm.googleapis.com/x'), false);
    assert.equal(isApplePush('https://push.apple.com.evil.example/x'), false);
    assert.equal(isApplePush('not a url'), false);
});

test('every key the push text uses survives the service worker build', () => {
    const sources = [
        'resources/js/modules/notification/lib/notification-text.ts',
        'resources/js/shared/lib/request-title.ts',
        'resources/js/sw/sw.ts',
    ];
    const used = sources.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/'((?:notif|notification|req|rep)_[a-z_]+)'/g)].map((m) => m[1]));
    assert.ok(used.length > 30);
    assert.deepEqual(
        used.filter((key) => !isBellKey(key)),
        [],
    );
    // Keys composed at runtime
    ['notification_name_ticket_new', 'notif_ticket_sla_over_sla', 'notif_ticket_owner_resolved', 'rep_tickets_overview_title'].forEach((key) =>
        assert.equal(isBellKey(key), true, key),
    );
    Object.values(REQUEST_TYPE_LABEL_KEY).forEach((key) => assert.equal(isBellKey(key), true, key));
});

test('screen text is left out of the service worker', () => {
    assert.equal(isBellKey('access_title'), false);
    assert.equal(isBellKey('req_status_pending'), false);
    assert.equal(isBellKey('rep_tickets_overview_hint'), false);
});

test('pushes are handled one at a time, so the second reads what the first wrote', async () => {
    const run = serialQueue();
    let shown: number | null = null;
    const handle = (delay: number) =>
        run(async () => {
            const prev = shown;
            await new Promise((resolve) => setTimeout(resolve, delay));
            shown = (prev ?? 0) + 1;
            return shown;
        });
    assert.deepEqual(await Promise.all([handle(20), handle(0)]), [1, 2]);
});

test('a failed push does not block the next one', async () => {
    const run = serialQueue();
    const failed = run(() => Promise.reject(new Error('bad text')));
    const next = run(async () => 'shown');
    await assert.rejects(failed);
    assert.equal(await next, 'shown');
});

test('stored wording keeps only string en/th values', () => {
    assert.deepEqual(
        sanitizeWording({
            notif_ticket_new: { en: 'New', th: 'ใหม่' },
            notif_ticket_assigned: { en: 'Yours', th: null },
            notif_resigned: { en: 1, th: { x: 1 } },
            notif_departure: 'flat string',
        }),
        { notif_ticket_new: { en: 'New', th: 'ใหม่' }, notif_ticket_assigned: { en: 'Yours' } },
    );
    assert.deepEqual(sanitizeWording(null), {});
    assert.deepEqual(sanitizeWording(['x']), {});
    assert.deepEqual(sanitizeWording('x'), {});
});

test('wording and clear are accepted only from app tabs', () => {
    assert.equal(isWindowSource({ type: 'window', id: '1' }), true);
    assert.equal(isWindowSource({ type: 'worker', id: '2' }), false);
    assert.equal(isWindowSource(null), false);
    assert.equal(isWindowSource({}), false);
});
