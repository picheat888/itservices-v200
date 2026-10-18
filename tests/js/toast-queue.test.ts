// Toast queue: timed toasts enter one at a time 1.5s apart, at most 5 on screen; errors show at once and do not count.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    nextPromotionAt,
    promoteNext,
    TOAST_MAX_TIMED,
    TOAST_STAGGER_MS,
    useToastStore,
    visibleToasts,
    type Toast,
} from '../../resources/js/stores/toast.ts';

const reset = () => useToastStore.setState({ toasts: [], lastShownAt: Number.NEGATIVE_INFINITY });
const shownIds = () => visibleToasts(useToastStore.getState().toasts).map((toast) => toast.message);

test('a burst enters one toast per gap, in the order it was pushed', (t) => {
    reset();
    let now = 1_000_000;
    t.mock.method(Date, 'now', () => now);
    const { push, promote } = useToastStore.getState();
    for (let i = 1; i <= 8; i++) push(`t${i}`, 'success');

    assert.deepEqual(shownIds(), ['t1']);
    promote(now + TOAST_STAGGER_MS - 1);
    assert.deepEqual(shownIds(), ['t1']);
    now += TOAST_STAGGER_MS;
    promote(now);
    promote(now);
    assert.deepEqual(shownIds(), ['t1', 't2']);
});

test('at most five timed toasts are on screen; the sixth waits for a slot', (t) => {
    reset();
    let now = 2_000_000;
    t.mock.method(Date, 'now', () => now);
    const { push, promote, dismiss } = useToastStore.getState();
    for (let i = 1; i <= 7; i++) push(`t${i}`, 'info', undefined, undefined, { duration: 60_000 });
    for (let i = 0; i < 10; i++) {
        now += TOAST_STAGGER_MS;
        promote(now);
    }
    assert.equal(shownIds().length, TOAST_MAX_TIMED);
    assert.equal(nextPromotionAt(useToastStore.getState().toasts, useToastStore.getState().lastShownAt), null);

    dismiss(useToastStore.getState().toasts[0].id);
    promote(now);
    assert.deepEqual(shownIds(), ['t2', 't3', 't4', 't5', 't6']);
});

test('an error shows at once and does not take a timed slot', (t) => {
    reset();
    const now = 3_000_000;
    t.mock.method(Date, 'now', () => now);
    const { push } = useToastStore.getState();
    push('saved', 'success');
    push('failed', 'error');
    push('second', 'success');

    assert.deepEqual(shownIds(), ['saved', 'failed']);
    const waiting = useToastStore.getState().toasts.filter((toast) => toast.shownAt === null);
    assert.deepEqual(
        waiting.map((toast) => toast.message),
        ['second'],
    );
});

test('a dismissed toast does not pull the next one forward', () => {
    const toast = (id: number, shownAt: number | null): Toast => ({
        id,
        key: `k${id}`,
        message: `m${id}`,
        tone: 'info',
        duration: 5000,
        createdAt: 0,
        shownAt,
    });
    assert.equal(promoteNext([toast(2, null)], 10_000, 10_000 + TOAST_STAGGER_MS - 1), null);
    assert.equal(promoteNext([toast(2, null)], 10_000, 10_000 + TOAST_STAGGER_MS)?.toasts[0].shownAt, 10_000 + TOAST_STAGGER_MS);
});

test('the same key within a second collapses into one toast', (t) => {
    reset();
    const now = 4_000_000;
    t.mock.method(Date, 'now', () => now);
    const { push } = useToastStore.getState();
    push('slow down', 'warning', undefined, undefined, { key: 'http-throttle' });
    push('slow down 59', 'warning', undefined, undefined, { key: 'http-throttle' });
    assert.equal(useToastStore.getState().toasts.length, 1);
});
