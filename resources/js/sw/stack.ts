// The one stacked OS notification the service worker keeps per device: count, sound pacing, body and click target.
// Pure (relative imports only) so node tests can load it.

export type StackState = { count: number; lastSoundAt: number; firstTarget: string };

const QUIET_WINDOW_MS = 60_000;

/** The stack after one more push arrives; rings unless the last sound was under a minute ago. */
export function nextStack(prev: StackState | null, target: string, now: number): StackState & { renotify: boolean } {
    if (prev === null) {
        return { count: 1, lastSoundAt: now, firstTarget: target, renotify: true };
    }
    const renotify = now - prev.lastSoundAt >= QUIET_WINDOW_MS;

    return {
        count: prev.count + 1,
        lastSoundAt: renotify ? now : prev.lastSoundAt,
        firstTarget: prev.firstTarget,
        renotify,
    };
}

/** One bell shows its own message; a stack says how many more arrived. */
export function stackBody(message: string, count: number, moreText: (n: number) => string): string {
    return count > 1 ? moreText(count - 1) : message;
}

/** One bell opens its own page; a stack opens the app with the bell tray. */
export function stackTarget(state: StackState): string {
    return state.count > 1 ? '/?bell=1' : state.firstTarget;
}

/** Safari's push service, which revokes a subscription whose push showed nothing. */
export function isApplePush(endpoint: string): boolean {
    try {
        const host = new URL(endpoint).hostname;

        return host === 'push.apple.com' || host.endsWith('.push.apple.com');
    } catch {
        return false;
    }
}

/** Runs tasks one after another, so each push reads the notification the previous one wrote; a failure does not block the next. */
export function serialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
    let tail: Promise<unknown> = Promise.resolve();

    return <T>(task: () => Promise<T>): Promise<T> => {
        const result = tail.then(task);
        tail = result.catch(() => undefined);
        return result;
    };
}
