import { QueryClient } from '@tanstack/react-query';

// Single shared React Query client. Lives in its own module so non-React code
// (e.g. the axios interceptor in services/http.ts) can read cached state such
// as the authenticated user without importing the React entrypoint.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            // A 404 answers the same however many times it is asked: the record is not
            // there. Retrying it only delays the screen that can say so — a detail dialog
            // sat on its skeleton for seconds before it could report a dead link. Every
            // other failure keeps retrying (one less round than the library's default,
            // which is three).
            retry: (count, error) => count < 2 && (error as { response?: { status?: number } })?.response?.status !== 404,
        },
    },
});

/** React Query key holding the current user (null when unauthenticated). */
export const ME_KEY = ['auth', 'me'] as const;
