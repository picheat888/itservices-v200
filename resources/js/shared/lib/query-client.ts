import { shouldRetryQuery } from '@/shared/lib/http-errors';
import { QueryClient } from '@tanstack/react-query';

// Single shared React Query client, in its own module so non-React code (the axios interceptor in shared/lib/http.ts) can read the cache.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: shouldRetryQuery,
        },
    },
});

/** React Query key holding the current user (null when unauthenticated). */
export const ME_KEY = ['auth', 'me'] as const;
