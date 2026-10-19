// Toast queue: timed toasts enter one at a time 1.5s apart, at most 5 on screen; errors show at once and do not count.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    nextPromotionAt,
    promoteNext,
    TOAST_LEAVE_MS,
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

test('the same key stays one toast while the first is still up, and may come back once it leaves', (t) => {
    reset();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let now = 4_500_000;
    t.mock.method(Date, 'now', () => now);
    const { push, leave } = useToastStore.getState();
    push('slow down', 'warning', undefined, undefined, { key: 'http-throttle' });
    now += 3_000;
    push('slow down again', 'warning', undefined, undefined, { key: 'http-throttle' });
    assert.equal(useToastStore.getState().toasts.length, 1);

    leave(useToastStore.getState().toasts[0].id);
    push('slow down while it slides out', 'warning', undefined, undefined, { key: 'http-throttle' });
    t.mock.timers.tick(TOAST_LEAVE_MS);
    assert.equal(useToastStore.getState().toasts.length, 1);
    assert.equal(useToastStore.getState().toasts[0].message, 'slow down while it slides out');
});

test('a group dismissal slides shown toasts out before removing them; queued ones drop at once', (t) => {
    reset();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let now = 5_000_000;
    t.mock.method(Date, 'now', () => now);
    const { push, promote, dismissGroup } = useToastStore.getState();
    push('a', 'info', undefined, undefined, { group: 'g' });
    now += TOAST_STAGGER_MS;
    promote(now);
    push('b', 'info', undefined, undefined, { group: 'g' });
    push('c', 'info', undefined, undefined, { group: 'g' });
    assert.deepEqual(shownIds(), ['a', 'b']);

    const [a] = useToastStore.getState().toasts;
    dismissGroup('g', a.id);
    assert.deepEqual(
        useToastStore.getState().toasts.map((toast) => [toast.message, Boolean(toast.leaving)]),
        [
            ['a', false],
            ['b', true],
        ],
    );

    t.mock.timers.tick(TOAST_LEAVE_MS);
    assert.deepEqual(
        useToastStore.getState().toasts.map((toast) => toast.id),
        [a.id],
    );
});
