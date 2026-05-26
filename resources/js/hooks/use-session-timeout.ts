import { authApi } from '@/services/authApi';
import { settingsApi } from '@/services/settingsApi';
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
 * - Polls every 5 s; shows a 2-minute warning modal before forced logout.
 * - Activity events (mouse / keyboard / scroll) keep resetting the clock
 *   as long as the warning modal is not yet open.
 * - extendSession() dismisses the modal and resets the clock.
 * - doLogout()     logs the user out immediately.
 */
export function useSessionTimeout() {
    const qc = useQueryClient();

    const [showWarning, setShowWarning] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(WARN_BEFORE_SEC);

    const timeoutMsRef = useRef(0);        // 0 = disabled
    const lastActivityRef = useRef(Date.now());
    const warningActiveRef = useRef(false);
    const mainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    const extendSession = useCallback(() => {
        lastActivityRef.current = Date.now();
        warningActiveRef.current = false;
        setShowWarning(false);
        setSecondsLeft(WARN_BEFORE_SEC);
        clearCountdown();
    }, []);

    // Load session_timeout_minutes once at mount.
    useEffect(() => {
        settingsApi.getSecurity()
            .then(({ session_timeout_minutes }) => {
                timeoutMsRef.current = session_timeout_minutes > 0
                    ? session_timeout_minutes * 60_000
                    : 0;
            })
            .catch(() => { /* settings unreachable — leave disabled */ });
    }, []);

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
                const secs = Math.max(1, Math.ceil(remaining / 1_000));
                setSecondsLeft(secs);
                setShowWarning(true);

                // Start the visible countdown.
                countdownRef.current = setInterval(() => {
                    setSecondsLeft((s) => {
                        const next = s - 1;
                        if (next <= 0) {
                            doLogout();
                            return 0;
                        }
                        return next;
                    });
                }, 1_000);
            }
        }, POLL_INTERVAL_MS);

        return () => {
            if (mainIntervalRef.current) clearInterval(mainIntervalRef.current);
            clearCountdown();
        };
    }, [doLogout]);

    return { showWarning, secondsLeft, extendSession, doLogout };
}
