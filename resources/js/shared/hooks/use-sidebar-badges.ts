import { http } from '@/shared/lib/http';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/** "Needs attention" counts keyed by sidebar nav item id (my_assets: the avatar's pill); 0 for anything the user may not see. */
export type SidebarBadges = Record<'employees' | 'access' | 'tickets' | 'requests' | 'assets' | 'my_assets' | 'contracts' | 'stock', number>;

/** Query key for the combined badge counts — modules invalidate it after an action changes a count. */
export const SIDEBAR_BADGES_KEY = ['sidebar-badges'] as const;

/** Every sidebar badge in one request (undefined until loaded), polled every 15s while the tab is visible. */
export function useSidebarBadges(enabled = true): SidebarBadges | undefined {
    const { data } = useQuery(sidebarBadgesQuery(enabled));

    return data;
}

/** One badge's count, or undefined while unknown (a page that must tell "unknown" from "zero"). */
export function useSidebarBadge(key: keyof SidebarBadges): number | undefined {
    const { data } = useQuery(sidebarBadgesQuery(true));

    return data?.[key];
}

/** Starts loading the counts alongside the sign-in check; pages do not wait, the badges fade in when they land. */
export function usePrefetchSidebarBadges(): void {
    const qc = useQueryClient();

    useEffect(() => {
        // Signed-out visitors: a quiet 401, no retries
        void qc.prefetchQuery({ queryKey: SIDEBAR_BADGES_KEY, queryFn: () => fetchSidebarBadges(true), staleTime: 10_000, retry: false });
    }, [qc]);
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
