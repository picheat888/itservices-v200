// Idle sign-out: polls the inactivity clock, opens the warning before sign-out, and keeps the countdown on wall-clock time.
import { authApi } from '@/modules/auth/api/authApi';
import { warnSecondsFor } from '@/modules/auth/lib/session-warning';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Poll the idle clock every N seconds. */
const POLL_INTERVAL_MS = 5_000;

/** User-activity events that reset the inactivity clock. */
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

export function useSessionTimeout(timeoutMinutes: number) {
    const qc = useQueryClient();
    const warnSeconds = warnSecondsFor(timeoutMinutes);

    const [showWarning, setShowWarning] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(warnSeconds);

    const timeoutMsRef = useRef(0); // 0 = disabled
    const warnMsRef = useRef(0);
    const lastActivityRef = useRef(Date.now());
    const warningActiveRef = useRef(false);
    const mainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Wall-clock expiry, so background-tab throttling cannot stretch the countdown
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
            // Still redirect
        }
        qc.clear();
        window.location.href = '/login?reason=session_expired';
    }, [qc]);

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

    const openWarning = useCallback(
        (remaining: number) => {
            const expiresAt = Date.now() + remaining;
            expiresAtRef.current = expiresAt;
            setSecondsLeft(Math.max(1, Math.ceil(remaining / 1_000)));
            if (!warningActiveRef.current) {
                warningActiveRef.current = true;
                setShowWarning(true);
            }
            startCountdown(expiresAt);
        },
        [startCountdown],
    );

    const extendSession = useCallback(() => {
        // The ping refreshes the server's idle clock too; a 401 here is handled by the http interceptor
        authApi.ping().catch(() => {});
        lastActivityRef.current = Date.now();
        warningActiveRef.current = false;
        expiresAtRef.current = 0;
        setShowWarning(false);
        clearCountdown();
    }, []);

    // A new timeout setting restarts the clock and drops a warning raised under the old one
    useEffect(() => {
        timeoutMsRef.current = timeoutMinutes > 0 ? timeoutMinutes * 60_000 : 0;
        warnMsRef.current = warnSecondsFor(timeoutMinutes) * 1_000;
        lastActivityRef.current = Date.now();
        if (warningActiveRef.current) {
            warningActiveRef.current = false;
            expiresAtRef.current = 0;
            setShowWarning(false);
            clearCountdown();
        }
    }, [timeoutMinutes]);

    // Activity only counts while the warning is closed
    useEffect(() => {
        const handle = () => {
            if (!warningActiveRef.current) {
                lastActivityRef.current = Date.now();
            }
        };
        ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handle, { passive: true }));
        return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handle));
    }, []);

    // Back on a throttled background tab: recompute from wall-clock time
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') return;

            const ms = timeoutMsRef.current;
            if (ms <= 0) return;

            const remaining = ms - (Date.now() - lastActivityRef.current);
            if (remaining <= 0) {
                doLogout();
                return;
            }
            if (remaining <= warnMsRef.current) openWarning(remaining);
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [doLogout, openWarning]);

    // Main polling loop
    useEffect(() => {
        mainIntervalRef.current = setInterval(() => {
            const ms = timeoutMsRef.current;
            if (ms <= 0 || warningActiveRef.current) return;

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
    }, [doLogout, openWarning]);

    return { showWarning, secondsLeft, warnSeconds, extendSession, doLogout };
}
