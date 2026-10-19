// Idle sign-out: polls the inactivity clock, opens the warning before sign-out, and keeps the countdown on wall-clock time.
// Every tab of the browser shares one session cookie, so they share one activity time and sign out together.
import { authApi } from '@/modules/auth/api/authApi';
import {
    dismissesWarning,
    heartbeatMsFor,
    newerActivity,
    parseSessionMessage,
    pingDelay,
    shouldShareActivity,
    warnSecondsFor,
} from '@/modules/auth/lib/session-warning';
import { redirectToLogin, SESSION_CHANNEL } from '@/shared/lib/login-redirect';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Poll the idle clock every N seconds. */
const POLL_INTERVAL_MS = 5_000;

/** User-activity events that reset the inactivity clock. */
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

/** Latest activity in any tab, so a tab that missed a message still catches up on its next poll. */
const SHARED_ACTIVITY_KEY = 'itsd:last-activity';
/** Last heartbeat any tab sent, so one browser pings once per heartbeat. */
const SHARED_PING_KEY = 'itsd:last-ping';

function readShared(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeShared(key: string, at: number): void {
    try {
        localStorage.setItem(key, String(at));
    } catch {
        // Private mode or blocked storage: the channel message still reaches open tabs
    }
}

/** @param sendsHeartbeat false in a tab blocked by an account switch; the timeout is 0 for a remembered sign-in, which still pings */
export function useSessionTimeout(timeoutMinutes: number, sendsHeartbeat: boolean) {
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
    const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingActivityRef = useRef(0);
    const sendsHeartbeatRef = useRef(sendsHeartbeat);
    // This tab's last ping; other tabs only learn of a ping once it succeeds
    const lastPingRef = useRef(0);
    // Wall-clock expiry, so background-tab throttling cannot stretch the countdown
    const expiresAtRef = useRef<number>(0);

    const clearCountdown = () => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    };

    const clearHeartbeat = () => {
        if (heartbeatTimerRef.current) {
            clearTimeout(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
        }
    };

    const lastPing = useCallback(() => newerActivity(lastPingRef.current, readShared(SHARED_PING_KEY)), []);

    // The ping refreshes the server's idle clock; a failed one is forgotten so the next activity retries
    const sendPing = useCallback(() => {
        const previous = lastPingRef.current;
        const at = Date.now();
        lastPingRef.current = at;
        authApi
            .ping()
            .then(() => writeShared(SHARED_PING_KEY, at))
            .catch(() => {
                if (lastPingRef.current === at) lastPingRef.current = previous;
            });
    }, []);

    // Ping on real activity and once after a throttled burst, so the server's clock never lags this tab's
    const heartbeat = useCallback(
        (activityAt: number) => {
            if (!sendsHeartbeatRef.current) return;
            pendingActivityRef.current = activityAt;
            if (heartbeatTimerRef.current) return;

            const delay = pingDelay(activityAt, lastPing(), heartbeatMsFor(timeoutMsRef.current / 60_000));
            if (delay === 0) {
                sendPing();
                return;
            }
            heartbeatTimerRef.current = setTimeout(() => {
                heartbeatTimerRef.current = null;
                // Another tab may already have pinged since this activity
                if (lastPing() >= pendingActivityRef.current) return;
                sendPing();
            }, delay);
        },
        [lastPing, sendPing],
    );

    const closeWarning = useCallback(() => {
        warningActiveRef.current = false;
        expiresAtRef.current = 0;
        setShowWarning(false);
        clearCountdown();
    }, []);

    const shareActivity = useCallback((at: number, force = false) => {
        if (!force && !shouldShareActivity(at, lastSharedRef.current)) return;
        lastSharedRef.current = at;
        writeShared(SHARED_ACTIVITY_KEY, at);
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
        const shared = newerActivity(0, readShared(SHARED_ACTIVITY_KEY));
        if (shared > lastActivityRef.current) noteActivity(shared);
    }, [noteActivity]);

    // announce: false when the news came from another tab, which has already told everyone
    const leaveForLogin = useCallback(
        (announce: boolean) => {
            if (mainIntervalRef.current) clearInterval(mainIntervalRef.current);
            clearCountdown();
            clearHeartbeat();
            qc.clear();
            redirectToLogin('session_expired', { announce });
        },
        [qc],
    );

    const doLogout = useCallback(async () => {
        if (mainIntervalRef.current) clearInterval(mainIntervalRef.current);
        clearCountdown();
        clearHeartbeat();
        try {
            await authApi.logout();
        } catch {
            // Still redirect
        }
        // Announced only now: earlier, the other tabs' login pages still find the session alive
        leaveForLogin(true);
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
        sendPing();
        const now = Date.now();
        lastActivityRef.current = now;
        closeWarning();
        shareActivity(now, true);
    }, [closeWarning, shareActivity, sendPing]);

    // One channel per tab: activity closes other tabs' warnings, a sign-out takes every tab to the login page
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;
        const channel = new BroadcastChannel(SESSION_CHANNEL);
        channelRef.current = channel;
        channel.onmessage = (event: MessageEvent) => {
            const message = parseSessionMessage(event.data);
            if (message?.type === 'activity') noteActivity(message.at);
            if (message?.type === 'logout') leaveForLogin(false);
        };
        return () => {
            channel.close();
            channelRef.current = null;
        };
    }, [noteActivity, leaveForLogin]);

    useEffect(() => {
        sendsHeartbeatRef.current = sendsHeartbeat;
    }, [sendsHeartbeat]);

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
            heartbeat(now);
        };
        ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handle, { passive: true }));
        return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handle));
    }, [shareActivity, heartbeat]);

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
            clearHeartbeat();
        };
    }, [catchUpWithOtherTabs, doLogout, openWarning]);

    return { showWarning, secondsLeft, warnSeconds, extendSession, doLogout };
}
