// Push on this device for React: the shared push state query, and the app-wide service worker bridge.
import { useAuth } from '@/modules/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { currentPushState, postToServiceWorker, registerServiceWorker, resubscribeIfWanted } from '../lib/push-client';
import type { PushState } from '../lib/push-rules';
import { useNotificationMessages } from './use-notifications';

const PUSH_STATE = ['push-state'] as const;

/** This browser's push state for a person, shared by the bell invite and the profile tab; asked again on focus. */
export function usePushState(userId: number | null) {
    const qc = useQueryClient();
    const query = useQuery({
        queryKey: [...PUSH_STATE, userId],
        queryFn: () => currentPushState(userId ?? undefined),
        enabled: userId !== null,
        staleTime: 0,
        retry: false,
    });
    const setState = useCallback((next: PushState) => qc.setQueryData([...PUSH_STATE, userId], next), [qc, userId]);

    return { state: query.data, setState };
}

/** Registers /sw.js, keeps its bell wording current, resets its stacked push when the tab shows, and resubscribes after sign-in. */
export function useServiceWorkerBridge(): void {
    const { user } = useAuth();
    const userId = user?.id ?? null;

    useEffect(() => {
        void registerServiceWorker();
    }, []);

    const { data: wording } = useNotificationMessages(userId !== null);
    useEffect(() => {
        if (wording) void postToServiceWorker({ type: 'wording', data: wording });
    }, [wording]);

    // Coming back to the page restarts the stacked push's count
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') void postToServiceWorker({ type: 'clear' });
        };
        onVisible();
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    const qc = useQueryClient();
    useEffect(() => {
        if (userId === null) return;
        void resubscribeIfWanted(userId).then(() => qc.invalidateQueries({ queryKey: [...PUSH_STATE, userId] }));
    }, [userId, qc]);
}
