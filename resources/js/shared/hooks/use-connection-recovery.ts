// While the "connection lost" dialog is up: check again when the browser comes back online and every 10 seconds,
// then close the dialog and refetch what is on it, so nothing typed underneath is lost to a reload.
import { serverReachable } from '@/shared/lib/http';
import { queryClient } from '@/shared/lib/query-client';
import { useAppErrorStore } from '@/stores/app-error';
import { useCallback, useEffect, useRef, useState } from 'react';

const RECHECK_MS = 10_000;

export function useConnectionRecovery(active: boolean) {
    const [checking, setChecking] = useState(false);
    const [stillDown, setStillDown] = useState(false);
    const busyRef = useRef(false);

    const check = useCallback(async (askedByReader: boolean) => {
        if (busyRef.current) return;
        busyRef.current = true;
        if (askedByReader) setChecking(true);
        const reachable = await serverReachable();
        busyRef.current = false;
        setChecking(false);
        if (!reachable) {
            if (askedByReader) setStillDown(true);
            return;
        }
        setStillDown(false);
        if (useAppErrorStore.getState().kind !== 'network') return;
        useAppErrorStore.getState().clear();
        void queryClient.invalidateQueries({ refetchType: 'active' });
    }, []);

    // A later outage starts without the last one's "still down" line
    if (!active && stillDown) setStillDown(false);

    useEffect(() => {
        if (!active) return;
        const onOnline = () => void check(false);
        window.addEventListener('online', onOnline);
        const timer = setInterval(() => {
            if (navigator.onLine) void check(false);
        }, RECHECK_MS);
        return () => {
            window.removeEventListener('online', onOnline);
            clearInterval(timer);
        };
    }, [active, check]);

    return { checking, stillDown, retry: () => void check(true) };
}
