import { http } from '@/shared/lib/http';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** "Needs attention" counts per sidebar nav item id — 0 for anything the user may not see. */
export interface SidebarBadges {
    employees: number;
    access: number;
    tickets: number;
    requests: number;
    assets: number;
    my_assets: number;
    contracts: number;
    stock: number;
}

const EMPTY: SidebarBadges = { employees: 0, access: 0, tickets: 0, requests: 0, assets: 0, my_assets: 0, contracts: 0, stock: 0 };

/** Query key for the combined badge counts — modules invalidate it after an action changes a count. */
export const SIDEBAR_BADGES_KEY = ['sidebar-badges'] as const;

/** Every sidebar badge in one request, polled every 15s while the tab is visible (refreshed on return). */
export function useSidebarBadges(enabled = true) {
    const { data } = useQuery(sidebarBadgesQuery(enabled));

    return data ?? EMPTY;
}

/** One badge's count, or undefined while unknown (a page that must tell "unknown" from "zero"). */
export function useSidebarBadge(key: keyof SidebarBadges): number | undefined {
    const { data } = useQuery(sidebarBadgesQuery(true));

    return data?.[key];
}

/** Loads the counts at start-up and says when that load settled; ProtectedRoute waits for it so pages draw with their counts. */
export function usePrefetchSidebarBadges(): boolean {
    const qc = useQueryClient();
    const [settled, setSettled] = useState(() => qc.getQueryState(SIDEBAR_BADGES_KEY)?.status === 'success');

    useEffect(() => {
        let alive = true;
        // Signed-out visitors: a quiet 401, no retries; a failed load still counts as settled
        qc.prefetchQuery({ queryKey: SIDEBAR_BADGES_KEY, queryFn: () => fetchSidebarBadges(true), staleTime: 10_000, retry: false }).finally(() => {
            if (alive) setSettled(true);
        });
        return () => {
            alive = false;
        };
    }, [qc]);

    return settled;
}

function fetchSidebarBadges(quietUnauthenticated = false): Promise<SidebarBadges> {
    return http.get<{ data: SidebarBadges }>('/sidebar-badges', { quietUnauthenticated }).then((r) => r.data.data);
}

function sidebarBadgesQuery(enabled: boolean) {
    return {
        queryKey: SIDEBAR_BADGES_KEY,
        queryFn: () => fetchSidebarBadges(),
        enabled,
        staleTime: 10_000,
        refetchInterval: 15_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
    };
}
