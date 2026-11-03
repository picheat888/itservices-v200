// React Query hooks for the monitor TV (board, pairing) and Settings → จอ Monitor, plus the TV's stored device token.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { isUnpaired, monitorApi } from '../api/monitorApi';
import type { MonitorDeviceStatus } from '../types';

const BOARD_EVERY_MS = 10_000;
const PAIR_POLL_MS = 3_000;
const TOKEN_KEY = 'itsd.monitor.token';
const DEVICE = ['monitor', 'device'] as const;

export function readMonitorToken(): string | null {
    try {
        return window.localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function writeMonitorToken(token: string | null): void {
    try {
        if (token) window.localStorage.setItem(TOKEN_KEY, token);
        else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
        // Private mode: the TV pairs again after a restart
    }
}

/** The board every 10 s; keeps the last good board through failures and counts them. */
export function useMonitorBoard(token: string | null, enabled = true) {
    const failures = useRef(0);
    const [lastOkAt, setLastOkAt] = useState<number | null>(null);

    const query = useQuery({
        queryKey: ['monitor', 'board', token ?? 'session'],
        queryFn: async () => {
            try {
                const board = await monitorApi.board(token);
                failures.current = 0;
                setLastOkAt(Date.now());
                return board;
            } catch (error) {
                if (!isUnpaired(error)) failures.current += 1;
                throw error;
            }
        },
        enabled,
        refetchInterval: (q) => (isUnpaired(q.state.error) ? false : BOARD_EVERY_MS),
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: false,
        retry: false,
        placeholderData: (previous) => previous,
    });

    return { ...query, failures: failures.current, lastOkAt, unpaired: isUnpaired(query.error) };
}

/** A pairing code for this TV, re-requested when it expires. */
export function usePairingCode(enabled: boolean) {
    return useQuery({
        queryKey: ['monitor', 'pairing-code'],
        queryFn: monitorApi.requestCode,
        enabled,
        staleTime: Infinity,
        refetchInterval: (q) => {
            const expires = q.state.data ? Date.parse(q.state.data.expires_at) - Date.now() : 5_000;
            return Math.max(1_000, expires);
        },
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: false,
        retry: true,
        retryDelay: 5_000,
    });
}

/** Waits for an admin to type this TV's code. */
export function usePairingPoll(pairingId: string | null) {
    return useQuery({
        queryKey: ['monitor', 'pairing', pairingId],
        queryFn: () => monitorApi.pollPairing(pairingId as string),
        enabled: pairingId !== null,
        refetchInterval: PAIR_POLL_MS,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: false,
        gcTime: 0,
    });
}

/** Settings: the paired TV's status, refreshed every 10 s while the section is open. */
export const useMonitorDevice = () =>
    useQuery({ queryKey: DEVICE, queryFn: monitorApi.deviceStatus, refetchInterval: BOARD_EVERY_MS, refetchOnWindowFocus: true });

function useDeviceWrite<A>(write: (arg: A) => Promise<MonitorDeviceStatus>) {
    const qc = useQueryClient();
    const onSuccess = useCallback((status: MonitorDeviceStatus) => qc.setQueryData(DEVICE, status), [qc]);
    return useMutation({ mutationFn: write, onSuccess });
}

export const usePairMonitor = () => useDeviceWrite((code: string) => monitorApi.pair(code));

export const useUnpairMonitor = () => useDeviceWrite<void>(() => monitorApi.unpair());
