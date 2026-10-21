// Wires a dropdown's React Query list to SearchableSelect's `refresh`: refetch on open under the five-second rule, plus its state.
import { shouldRequest } from '@/shared/lib/freshness';
import type { UseQueryResult } from '@tanstack/react-query';

export interface SelectRefresh {
    refreshing: boolean;
    failed: boolean;
    /** The list has loaded at least once (from the server or from initial data). */
    loaded: boolean;
    /** `force` is a user-pressed reload, which ignores the five-second rule. */
    refresh: (force?: boolean) => void;
}

export function useSelectRefresh(query: Pick<UseQueryResult<unknown>, 'isFetching' | 'isError' | 'dataUpdatedAt' | 'refetch'>): SelectRefresh {
    return {
        refreshing: query.isFetching,
        failed: query.isError && !query.isFetching,
        loaded: query.dataUpdatedAt > 0,
        refresh: (force = false) => {
            if (shouldRequest(force, query.isFetching, query.dataUpdatedAt, Date.now())) {
                void query.refetch();
            }
        },
    };
}
