// React Query hooks for the My Profile sign-ins tab: devices, ending one, and the recent login events.
import { httpStatus } from '@/shared/lib/http-errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devicesApi } from '../api/devicesApi';

const DEVICES_KEY = ['my-devices'] as const;
const EVENTS_KEY = ['my-login-events'] as const;

/** Keeps the "last used" times fresh while the drawer is open. */
const DEVICES_POLL_MS = 30_000;

export const useMyDevices = (enabled = true) =>
    useQuery({ queryKey: DEVICES_KEY, queryFn: devicesApi.list, enabled, refetchInterval: DEVICES_POLL_MS });

export const useMyLoginEvents = (enabled = true) => useQuery({ queryKey: EVENTS_KEY, queryFn: devicesApi.events, enabled });

/** Signs one other device out, then refreshes the device list and the history. */
export function useEndMyDevice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => {
            try {
                await devicesApi.end(id);
            } catch (error) {
                // Already signed out elsewhere: the card goes away all the same
                if (httpStatus(error) !== 404) throw error;
            }
        },
        onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: DEVICES_KEY }), qc.invalidateQueries({ queryKey: EVENTS_KEY })]),
    });
}
