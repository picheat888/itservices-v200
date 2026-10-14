// Idle sign-out: polls the inactivity clock, opens the warning before sign-out, and keeps the countdown on wall-clock time.
// Every tab of the browser shares one session cookie, so they share one activity time and sign out together.
import { authApi } from '@/modules/auth/api/authApi';
import { dismissesWarning, newerActivity, parseSessionMessage, shouldShareActivity, warnSecondsFor } from '@/modules/auth/lib/session-warning';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Poll the idle clock every N seconds. */
const POLL_INTERVAL_MS = 5_000;

/** User-activity events that reset the inactivity clock. */
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

/** Latest activity in any tab, so a tab that missed a message still catches up on its next poll. */
const SHARED_ACTIVITY_KEY = 'itsd:last-activity';
const CHANNEL_NAME = 'itsd-session';

const EXPIRED_URL = '/login?reason=session_expired';

function readSharedActivity(): string | null {
    try {
        return localStorage.getItem(SHARED_ACTIVITY_KEY);
    } catch {
        return null;
    }
}

function writeSharedActivity(at: number): void {
    try {
        localStorage.setItem(SHARED_ACTIVITY_KEY, String(at));
    } catch {
        // Private mode or blocked storage: the channel message still reaches open tabs
    }
}

export function useSessionTimeout(timeoutMinutes: number) {
    const qc = useQueryClient();
    const warnSeconds = warnSecondsFor(timeoutMinutes);

    const [showWarning, setShowWarning] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(warnSeconds);

    const timeoutMsRef = useRef(0); // 0 = disabled
    const warnMsRef = useRef(0);
    const lastActivityRef = useRef(Date.now());
    const lastSharedRef = useRef(0);
    const warningActiveRef = useRef(false);
    const warningOpenedAtRef = useRef(0);
    const mainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const channelRef = useRef<BroadcastChannel | null>(null);
    // Wall-clock expiry, so background-tab throttling cannot stretch the countdown
    const expiresAtRef = useRef<number>(0);

    const clearCountdown = () => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    };

    const closeWarning = useCallback(() => {
        warningActiveRef.current = false;
        expiresAtRef.current = 0;
        setShowWarning(false);
        clearCountdown();
    }, []);

    const shareActivity = useCallback((at: number, force = false) => {
        if (!force && !shouldShareActivity(at, lastSharedRef.current)) return;
        lastSharedRef.current = at;
        writeSharedActivity(at);
        channelRef.current?.postMessage({ type: 'activity', at });
    }, []);

    // Activity from another tab: move the clock forward, and close a warning it makes stale
    const noteActivity = useCallback(
        (at: number) => {
            lastActivityRef.current = newerActivity(lastActivityRef.current, at);
            if (warningActiveRef.current && dismissesWarning(warningOpenedAtRef.current, at)) closeWarning();
        },
        [closeWarning],
    );

    const catchUpWithOtherTabs = useCallback(() => {
        const shared = newerActivity(0, readSharedActivity());
        if (shared > lastActivityRef.current) noteActivity(shared);
    }, [noteActivity]);

    const leaveForLogin = useCallback(() => {
        if (mainIntervalRef.current) clearInterval(mainIntervalRef.current);
        clearCountdown();
        qc.clear();
        window.location.href = EXPIRED_URL;
    }, [qc]);

    const doLogout = useCallback(async () => {
        if (mainIntervalRef.current) clearInterval(mainIntervalRef.current);
        clearCountdown();
        channelRef.current?.postMessage({ type: 'logout' });
        try {
            await authApi.logout();
        } catch {
            // Still redirect
        }
        leaveForLogin();
    }, [leaveForLogin]);

    const startCountdown = useCallback(
        (expiresAt: number) => {
            clearCountdown();
            countdownRef.current = setInterval(() => {
                const secs = Math.ceil((expiresAt - Date.now()) / 1_000);
                if (secs <= 0) {
                    // Last look: another tab may have been used while this one counted down
                    catchUpWithOtherTabs();
                    if (!warningActiveRef.current) return;
                    clearCountdown();
                    doLogout();
                    return;
                }
                setSecondsLeft(secs);
            }, 500);
        },
        [catchUpWithOtherTabs, doLogout],
    );

    const openWarning = useCallback(
        (remaining: number) => {
            const expiresAt = Date.now() + remaining;
            expiresAtRef.current = expiresAt;
            setSecondsLeft(Math.max(1, Math.ceil(remaining / 1_000)));
            if (!warningActiveRef.current) {
                warningActiveRef.current = true;
                warningOpenedAtRef.current = Date.now();
                setShowWarning(true);
            }
            startCountdown(expiresAt);
        },
        [startCountdown],
    );

    const extendSession = useCallback(() => {
        // The ping refreshes the server's idle clock too; a 401 here is handled by the http interceptor
        authApi.ping().catch(() => {});
        const now = Date.now();
        lastActivityRef.current = now;
        closeWarning();
        shareActivity(now, true);
    }, [closeWarning, shareActivity]);

    // One channel per tab: activity closes other tabs' warnings, a sign-out takes every tab to the login page
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = channel;
        channel.onmessage = (event: MessageEvent) => {
            const message = parseSessionMessage(event.data);
            if (message?.type === 'activity') noteActivity(message.at);
            if (message?.type === 'logout') leaveForLogin();
        };
        return () => {
            channel.close();
            channelRef.current = null;
        };
    }, [noteActivity, leaveForLogin]);

    // A new timeout setting restarts the clock and drops a warning raised under the old one
    useEffect(() => {
        timeoutMsRef.current = timeoutMinutes > 0 ? timeoutMinutes * 60_000 : 0;
        warnMsRef.current = warnSecondsFor(timeoutMinutes) * 1_000;
        lastActivityRef.current = Date.now();
        if (warningActiveRef.current) closeWarning();
    }, [timeoutMinutes, closeWarning]);

    // Activity only counts while this tab's warning is closed
    useEffect(() => {
        const handle = () => {
            if (warningActiveRef.current) return;
            const now = Date.now();
            lastActivityRef.current = now;
            shareActivity(now);
        };
        ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handle, { passive: true }));
        return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handle));
    }, [shareActivity]);

    // Back on a throttled background tab: recompute from wall-clock time
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') return;

            const ms = timeoutMsRef.current;
            if (ms <= 0) return;

            catchUpWithOtherTabs();
            const remaining = ms - (Date.now() - lastActivityRef.current);
            if (remaining <= 0) {
                doLogout();
                return;
            }
            if (remaining <= warnMsRef.current) openWarning(remaining);
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [catchUpWithOtherTabs, doLogout, openWarning]);

    // Main polling loop
    useEffect(() => {
        mainIntervalRef.current = setInterval(() => {
            const ms = timeoutMsRef.current;
            if (ms <= 0) return;

            catchUpWithOtherTabs();
            if (warningActiveRef.current) return;

            const remaining = ms - (Date.now() - lastActivityRef.current);
            if (remaining <= 0) {
                doLogout();
                return;
            }
            if (remaining <= warnMsRef.current) openWarning(remaining);
        }, POLL_INTERVAL_MS);

        return () => {
            if (mainIntervalRef.current) clearInterval(mainIntervalRef.current);
            clearCountdown();
        };
    }, [catchUpWithOtherTabs, doLogout, openWarning]);

    return { showWarning, secondsLeft, warnSeconds, extendSession, doLogout };
}
