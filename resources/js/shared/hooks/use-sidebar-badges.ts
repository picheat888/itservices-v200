import { http } from '@/shared/lib/http';
import { useQuery } from '@tanstack/react-query';

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
    const { data } = useQuery({
        queryKey: SIDEBAR_BADGES_KEY,
        queryFn: () => http.get<{ data: SidebarBadges }>('/sidebar-badges').then((r) => r.data.data),
        enabled,
        staleTime: 10_000,
        refetchInterval: 15_000,
        refetchIntervalInBackground: true,
    });

    return data ?? EMPTY;
}
