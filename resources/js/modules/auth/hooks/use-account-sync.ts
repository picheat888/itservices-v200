// Keeps every tab honest about the account the shared session cookie holds: a sign-in in another tab, or a
// different account found on return to the tab, returns the account now in use so the shell can block the page.
import { authApi } from '@/modules/auth/api/authApi';
import { SESSION_CHANNEL } from '@/shared/lib/login-redirect';
import type { User } from '@/shared/types';
import { useEffect, useRef, useState } from 'react';
import { isOtherAccount, parseSessionMessage } from '../lib/session-warning';

export function useAccountSync(user: User | null): User | null {
    const [switchedTo, setSwitchedTo] = useState<User | null>(null);
    const shownIdRef = useRef<number | null>(user?.id ?? null);
    const switchedRef = useRef(false);

    // The account this tab was drawn for; frozen once a switch is found
    useEffect(() => {
        if (!switchedRef.current) shownIdRef.current = user?.id ?? null;
    }, [user?.id]);

    useEffect(() => {
        const check = (sessionUserId?: number) => {
            if (switchedRef.current || shownIdRef.current === null) return;
            if (sessionUserId !== undefined && !isOtherAccount(shownIdRef.current, sessionUserId)) return;
            authApi
                .me()
                .then((current) => {
                    if (switchedRef.current || !isOtherAccount(shownIdRef.current, current.id)) return;
                    switchedRef.current = true;
                    setSwitchedTo(current);
                })
                .catch(() => undefined);
        };

        // A sign-in in another tab
        const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANNEL);
        if (channel) {
            channel.onmessage = (event: MessageEvent) => {
                const message = parseSessionMessage(event.data);
                if (message?.type === 'login') check(message.userId);
            };
        }

        // Back on this tab: catch a switch whose message was missed
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') check();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            channel?.close();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    return switchedTo;
}
