// Push on this device: the state a browser is in, when the bell invites, and who is resubscribed after signing in.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    isIosDevice,
    pushDeliversHere,
    pushState,
    pushSyncStep,
    showInvite,
    SNOOZE_MS,
} from '../../resources/js/modules/notification/lib/push-rules.ts';

const NOW = new Date(2026, 9, 22, 12, 0).getTime();
const base = { hasPushManager: true, isIos: false, standalone: false, permission: 'default' as NotificationPermission, subscribed: false };

test('Safari on iPad outside the home screen needs the home screen', () =>
    assert.equal(pushState({ ...base, isIos: true, standalone: false }), 'needs_home_screen'));
test('an iPad opened from the home screen icon is judged like any browser', () =>
    assert.equal(pushState({ ...base, isIos: true, standalone: true, permission: 'granted', subscribed: true }), 'on'));
test('a browser without PushManager is unsupported', () => assert.equal(pushState({ ...base, hasPushManager: false }), 'unsupported'));
test('a denied permission reads as blocked', () => assert.equal(pushState({ ...base, permission: 'denied' }), 'blocked'));
test('granted and subscribed reads as on', () => assert.equal(pushState({ ...base, permission: 'granted', subscribed: true }), 'on'));
test('granted but not subscribed reads as off', () => assert.equal(pushState({ ...base, permission: 'granted' }), 'off'));
test('never asked reads as off', () => assert.equal(pushState(base), 'off'));

test('the invite shows to a browser that was never asked', () => assert.equal(showInvite('off', 'default', null, NOW, null), true));
test('the invite hides for 14 days after later', () => assert.equal(showInvite('off', 'default', NOW + SNOOZE_MS, NOW, null), false));
test('the invite comes back once the 14 days are over', () => assert.equal(showInvite('off', 'default', NOW - 1, NOW, null), true));
test('later is 14 days', () => assert.equal(SNOOZE_MS, 14 * 24 * 60 * 60 * 1000));
test('a second person on a browser already allowed sees their own invite', () => assert.equal(showInvite('off', 'granted', null, NOW, null), true));
test('a person who turned push off on purpose is not invited again', () => {
    assert.equal(showInvite('off', 'granted', null, NOW, '0'), false);
    assert.equal(showInvite('off', 'default', null, NOW, '0'), false);
});
test('a second person who snoozed is not invited', () => assert.equal(showInvite('off', 'granted', NOW + 1, NOW, null), false));
test('the invite never shows once on or blocked', () => {
    assert.equal(showInvite('blocked', 'denied', null, NOW, null), false);
    assert.equal(showInvite('on', 'granted', null, NOW, '1'), false);
    assert.equal(showInvite('on', 'granted', null, NOW, null), false);
});
test('the home screen invite shows on iPad Safari unless snoozed', () => {
    assert.equal(showInvite('needs_home_screen', 'default', null, NOW, null), true);
    assert.equal(showInvite('needs_home_screen', 'default', NOW + 1, NOW, null), false);
});
test('an unsupported browser is never invited', () => assert.equal(showInvite('unsupported', 'default', null, NOW, null), false));

test('the same person signing back in is resubscribed', () => assert.equal(pushSyncStep(true, 'granted', false), 'subscribe'));
test('a different person on the same browser is not', () => {
    assert.equal(pushSyncStep(false, 'granted', false), 'none');
    assert.equal(pushSyncStep(false, 'granted', true), 'none');
});
test('nobody is resubscribed without the permission', () => {
    assert.equal(pushSyncStep(true, 'default', false), 'none');
    assert.equal(pushSyncStep(true, 'denied', false), 'none');
    assert.equal(pushSyncStep(true, 'denied', true), 'none');
});
test('a browser already subscribed for this person is confirmed with the server on each load', () =>
    assert.equal(pushSyncStep(true, 'granted', true), 'confirm'));

test('push counts as delivering here once the server confirmed it this session', () => assert.equal(pushDeliversHere('1', 'granted', true), true));
test('a subscription the server has not confirmed does not count, so hidden tabs keep ringing', () =>
    assert.equal(pushDeliversHere('1', 'granted', false), false));
test('push never counts without this person turning it on or without the permission', () => {
    assert.equal(pushDeliversHere(null, 'granted', true), false);
    assert.equal(pushDeliversHere('0', 'granted', true), false);
    assert.equal(pushDeliversHere('1', 'default', true), false);
    assert.equal(pushDeliversHere('1', 'denied', true), false);
});

test('iPhone and iPad user agents are iOS', () => {
    assert.equal(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5), true);
    assert.equal(isIosDevice('Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X)', 5), true);
});
test('iPadOS posing as a Mac is iOS when it has touch points', () =>
    assert.equal(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 5), true));
test('a real Mac is not iOS', () => assert.equal(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0), false));
test('Windows Chrome is not iOS', () => assert.equal(isIosDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0', 0), false));
