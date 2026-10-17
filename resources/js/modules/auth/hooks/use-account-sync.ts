// Keeps every tab on the account the shared session cookie holds: a sign-in elsewhere, or a different account
// found on return to the tab, reloads this one, which then says why in a toast.
import { useT } from '@/lang';
import { authApi } from '@/modules/auth/api/authApi';
import { SESSION_CHANNEL } from '@/shared/lib/login-redirect';
import type { User } from '@/shared/types';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { useEffect, useRef } from 'react';
import { isOtherAccount, parseSessionMessage } from '../lib/session-warning';

const SWITCHED_FLAG = 'itsd-account-switched';

function reloadAsTheOtherAccount(): void {
    try {
        sessionStorage.setItem(SWITCHED_FLAG, '1');
    } catch {
        // Private mode: the reload still happens, only the toast is lost
    }
    window.location.reload();
}

export function useAccountSync(user: User | null): void {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const pushToast = useToastStore((s) => s.push);
    const userIdRef = useRef<number | null>(user?.id ?? null);

    useEffect(() => {
        userIdRef.current = user?.id ?? null;
    }, [user?.id]);

    // After the reload: name the account this tab now shows
    useEffect(() => {
        if (!user) return;
        let switched = false;
        try {
            switched = sessionStorage.getItem(SWITCHED_FLAG) === '1';
            sessionStorage.removeItem(SWITCHED_FLAG);
        } catch {
            return;
        }
        if (!switched) return;
        const name = lang === 'th' ? (user.name_th ?? user.name) : user.name;
        pushToast(t('session_switched').replace('{name}', name), 'info');
    }, [user, lang, t, pushToast]);

    // A sign-in in another tab
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;
        const channel = new BroadcastChannel(SESSION_CHANNEL);
        channel.onmessage = (event: MessageEvent) => {
            const message = parseSessionMessage(event.data);
            if (message?.type === 'login' && isOtherAccount(userIdRef.current, message.userId)) reloadAsTheOtherAccount();
        };
        return () => channel.close();
    }, []);

    // Back on this tab: catch a switch whose message was missed
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState !== 'visible' || userIdRef.current === null) return;
            authApi
                .me()
                .then((current) => {
                    if (isOtherAccount(userIdRef.current, current.id)) reloadAsTheOtherAccount();
                })
                .catch(() => undefined);
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);
}
