// Actions behind the app-error dialog buttons that need the query cache.
import { queryClient } from '@/shared/lib/query-client';
import { useAppErrorStore } from '@/stores/app-error';

/** Close the dialog and ask again every on-screen query that failed. */
export function retryFailedQueries(): void {
    useAppErrorStore.getState().clear();
    void queryClient.refetchQueries({ type: 'active', predicate: (q) => q.state.status === 'error' });
}
