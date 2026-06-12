import { QueryClient } from '@tanstack/react-query';

// Single shared React Query client. Lives in its own module so non-React code
// (e.g. the axios interceptor in services/http.ts) can read cached state such
// as the authenticated user without importing the React entrypoint.
export const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

/** React Query key holding the current user (null when unauthenticated). */
export const ME_KEY = ['auth', 'me'] as const;
