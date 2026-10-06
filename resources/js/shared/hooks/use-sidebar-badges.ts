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

/**
 * Every sidebar badge in one request. Each badge used to fetch its own module endpoint,
 * so the numbers appeared one at a time (worse on the single-threaded dev server, where
 * the requests queue). One call means they all land together.
 *
 * Polls in the background on the same 15s cadence the asset badges used, so a handover
 * from another session still shows up without a reload.
 */
export function useSidebarBadges(enabled = true) {
    const { data } = useQuery(sidebarBadgesQuery(enabled));

    return data ?? EMPTY;
}

/**
 * One badge's count, or undefined if the counts have not loaded (or failed to) — for a page
 * that must tell "unknown" apart from "zero". Shares the sidebar's query, which
 * usePrefetchSidebarBadges loads before any page draws.
 */
export function useSidebarBadge(key: keyof SidebarBadges): number | undefined {
    const { data } = useQuery(sidebarBadgesQuery(true));

    return data?.[key];
}

/**
 * Starts the badge counts loading at app start-up, alongside the signed-in check, and says
 * when that load has settled. ProtectedRoute holds its spinner until it has, so a page draws
 * with its counts already known (the assets page's return strip sits above its tabs — drawn
 * without the count, it would push the page down when the count arrived).
 *
 * Fired before we know anyone is signed in, so a 401 here is quiet (no jump to the login
 * page); the route guard handles signed-out visitors. The 15-second poll stays loud, so a
 * session lost later is still caught. A failed load still counts as settled — the page
 * shows without the counts rather than waiting forever.
 */
export function usePrefetchSidebarBadges(): boolean {
    const qc = useQueryClient();
    const [settled, setSettled] = useState(() => qc.getQueryState(SIDEBAR_BADGES_KEY)?.status === 'success');

    useEffect(() => {
        let alive = true;
        qc.prefetchQuery({ queryKey: SIDEBAR_BADGES_KEY, queryFn: () => fetchSidebarBadges(true), staleTime: 10_000 }).finally(() => {
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
        refetchIntervalInBackground: true,
    };
}
