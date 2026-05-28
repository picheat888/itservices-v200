import { authApi } from '@/services/authApi';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Show warning this many seconds before forced logout. */
const WARN_BEFORE_SEC = 120;

/** Poll the idle clock every N seconds. */
const POLL_INTERVAL_MS = 5_000;

/** User-activity events that reset the inactivity clock. */
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

/**
 * Industry-standard inactivity-based session timeout.
 *
 * - Accepts timeoutMinutes from the caller (via React Query cache) so that
 *   admin changes to the setting take effect immediately without a page reload.
 * - Polls every 5 s; shows a warning modal before forced logout.
 * - Activity events (mouse / keyboard / scroll) keep resetting the clock
 *   as long as the warning modal is not yet open.
 * - extendSession() pings the server to refresh _sec_last_activity, then resets the clock.
 * - doLogout()     logs the user out immediately.
 * - visibilitychange recalculates from wall-clock time when the tab regains focus,
 *   which corrects the countdown after background-tab timer throttling.
 */
export function useSessionTimeout(timeoutMinutes: number) {
    const qc = useQueryClient();

    const [showWarning, setShowWarning] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(WARN_BEFORE_SEC);

    const timeoutMsRef = useRef(0);           // 0 = disabled
    const lastActivityRef = useRef(Date.now());
    const warningActiveRef = useRef(false);
    const mainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Absolute wall-clock time at which the session will expire (set when warning first shown).
    // Used so the countdown is immune to background-tab setInterval throttling.
    const expiresAtRef = useRef<number>(0);

    const clearCountdown = () => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    };

    const doLogout = useCallback(async () => {
        if (mainIntervalRef.current) clearInterval(mainIntervalRef.current);
        clearCountdown();
        try {
            await authApi.logout();
        } catch {
            // Ignore logout errors — still redirect.
        }
        qc.clear();
        window.location.href = '/login?reason=session_expired';
    }, [qc]);

    /**
     * Starts (or restarts) the visual countdown using wall-clock time rather than
     * decrement-per-tick. This makes the display accurate even when the browser
     * throttles setInterval in background tabs.
     */
    const startCountdown = useCallback(
        (expiresAt: number) => {
            clearCountdown();
            countdownRef.current = setInterval(() => {
                const secs = Math.ceil((expiresAt - Date.now()) / 1_000);
                if (secs <= 0) {
                    clearCountdown();
                    doLogout();
                    return;
                }
                setSecondsLeft(secs);
            }, 500);
        },
        [doLogout],
    );

    const extendSession = useCallback(() => {
        // Ping the server first so CheckSessionTimeout updates _sec_last_activity.
        // Without this call only the frontend timer resets; the server session
        // stays stale and the next real API call triggers a 401 redirect.
        authApi.ping().catch(() => {
            // 401 means the session already expired while the modal was open.
            // The http interceptor will redirect to /login — nothing more to do here.
        });
        lastActivityRef.current = Date.now();
        warningActiveRef.current = false;
        expiresAtRef.current = 0;
        setShowWarning(false);
        setSecondsLeft(WARN_BEFORE_SEC);
        clearCountdown();
    }, []);

    // Sync timeoutMsRef whenever the setting changes (e.g. admin saves new value).
    // Reset the activity clock so the timer always starts fresh on change.
    useEffect(() => {
        timeoutMsRef.current = timeoutMinutes > 0 ? timeoutMinutes * 60_000 : 0;
        lastActivityRef.current = Date.now();
        // If a warning was showing for the old timeout, dismiss it.
        if (warningActiveRef.current) {
            warningActiveRef.current = false;
            expiresAtRef.current = 0;
            setShowWarning(false);
            setSecondsLeft(WARN_BEFORE_SEC);
            clearCountdown();
        }
    }, [timeoutMinutes]);

    // Activity listener: only resets the clock while warning is not showing.
    useEffect(() => {
        const handle = () => {
            if (!warningActiveRef.current) {
                lastActivityRef.current = Date.now();
            }
        };
        ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handle, { passive: true }));
        return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handle));
    }, []);

    /**
     * Recalculates session state from wall-clock time whenever the tab regains
     * focus. This corrects the countdown after background-tab timer throttling —
     * the scenario where the user returns to a tab and the display shows e.g.
     * "33 s" even though the session has already expired on the server.
     */
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') return;

            const ms = timeoutMsRef.current;
            if (ms <= 0) return;

            const idle = Date.now() - lastActivityRef.current;
            const remaining = ms - idle;
            const warnAt = Math.min(WARN_BEFORE_SEC * 1_000, ms * 0.25);

            if (remaining <= 0) {
                // Session truly expired while tab was in background — logout immediately.
                doLogout();
                return;
            }

            if (remaining <= warnAt) {
                // (Re-)calculate expiry from wall clock and restart countdown with accurate value.
                const expiresAt = Date.now() + remaining;
                expiresAtRef.current = expiresAt;
                const secs = Math.max(1, Math.ceil(remaining / 1_000));
                setSecondsLeft(secs);
                if (!warningActiveRef.current) {
                    warningActiveRef.current = true;
                    setShowWarning(true);
                }
                startCountdown(expiresAt);
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [doLogout, startCountdown]);

    // Main polling loop.
    useEffect(() => {
        mainIntervalRef.current = setInterval(() => {
            const ms = timeoutMsRef.current;
            if (ms <= 0 || warningActiveRef.current) return;

            const idle = Date.now() - lastActivityRef.current;
            const remaining = ms - idle;

            // Warn at 2 min (or 25% of the total timeout, whichever is smaller).
            const warnAt = Math.min(WARN_BEFORE_SEC * 1_000, ms * 0.25);

            if (remaining <= 0) {
                doLogout();
                return;
            }

            if (remaining <= warnAt) {
                warningActiveRef.current = true;
                const expiresAt = Date.now() + remaining;
                expiresAtRef.current = expiresAt;
                const secs = Math.max(1, Math.ceil(remaining / 1_000));
                setSecondsLeft(secs);
                setShowWarning(true);
                startCountdown(expiresAt);
            }
        }, POLL_INTERVAL_MS);

        return () => {
            if (mainIntervalRef.current) clearInterval(mainIntervalRef.current);
            clearCountdown();
        };
    }, [doLogout, startCountdown]);

    return { showWarning, secondsLeft, extendSession, doLogout };
}
