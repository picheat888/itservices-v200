// A tab source for a tab whose component owns its queries: read from the cache by key, so the page's tab bar can mark it.
import type { TabQuery } from '@/shared/hooks/use-tab-freshness';
import { shouldRequest } from '@/shared/lib/freshness';
import { keySourceState } from '@/shared/lib/refresh-mark';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';

export function useKeyFreshness(queryKey: readonly unknown[]): TabQuery {
    const queryClient = useQueryClient();
    // Re-render whenever a watched query starts or stops fetching
    useIsFetching({ queryKey });
    const states = queryClient
        .getQueryCache()
        .findAll({ queryKey, type: 'active' })
        .map((q) => q.state);
    return {
        ...keySourceState(states),
        // The tab component may have just mounted and fetched, so the five-second rule is checked again here
        refetch: () =>
            queryClient.refetchQueries(
                {
                    queryKey,
                    type: 'active',
                    predicate: (q) => shouldRequest(false, q.state.fetchStatus === 'fetching', q.state.dataUpdatedAt, Date.now()),
                },
                { cancelRefetch: false },
            ),
    };
}
