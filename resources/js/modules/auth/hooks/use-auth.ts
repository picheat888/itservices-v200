import { authApi, type LoginPayload } from '@/modules/auth/api/authApi';
import { ME_KEY } from '@/shared/lib/query-client';
import { SUPER_ROLE, type User } from '@/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useAuth() {
    const query = useQuery<User | null>({
        queryKey: ME_KEY,
        queryFn: async () => {
            try {
                return await authApi.me();
            } catch {
                return null;
            }
        },
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

    const user = query.data ?? null;
    // The all-access role bypasses permission checks rather than being granted keys,
    // exactly as User::hasPermission does on the server. Keeping that here means no
    // screen has to remember it, and none of them break if a key is ever added to the
    // catalogue before it reaches the role.
    const isSuper = user?.role === SUPER_ROLE;

    return {
        user,
        isLoading: query.isLoading,
        isAuthenticated: !!user,
        isSuper,
        can: (permission: string) => isSuper || !!user?.permissions?.includes(permission),
    };
}

/**
 * Signing in starts from an empty cache.
 *
 * A login is an SPA transition, not a reload, so without this the new session
 * inherits whatever the previous one left behind — the incoming user is served
 * the last user's cached lists until each one refetches. It also broke the
 * notification toasts outright: the app shell seeds "already seen" from whatever
 * the notifications cache holds when it mounts, so seeding from the *previous*
 * session made the incoming user's entire unread pile look newly arrived, and
 * every one of them popped a toast.
 *
 * `removeQueries()` rather than `clear()`: clear() also empties the mutation
 * cache, which would pull this very mutation out from under its own callback.
 * Nothing but the login screen is mounted here, so no refetch storm follows.
 * ME_KEY is written straight after, so useAuth resolves without bouncing through
 * a loading state.
 */
export function useLogin() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: LoginPayload) => authApi.login(payload),
        onSuccess: (user) => {
            qc.removeQueries();
            qc.setQueryData(ME_KEY, user);
        },
    });
}

/**
 * Signing out leaves through a full page load, the same way the idle-timeout
 * logout does — the cache dies with the document, so there is nothing to clean
 * up by hand.
 *
 * Emptying the cache in place instead was worse than the problem it solved: the
 * app shell is still mounted at that moment, so every query on screen refetched
 * against a session the server had just destroyed, and each 401 sent the axios
 * interceptor after its own redirect while React was mid-navigation.
 */
export function useLogout() {
    return useMutation({
        mutationFn: () => authApi.logout(),
        // onSettled, not onSuccess: a logout call that errors out still means the user
        // asked to leave, and the login screen bounces them back if the session somehow
        // survived. Leaving them on a dead-looking dashboard is the worse answer.
        onSettled: () => {
            window.location.href = '/login';
        },
    });
}

export function useUpdateProfile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (form: FormData) => authApi.updateProfile(form),
        onSuccess: (user) => {
            qc.setQueryData(ME_KEY, user);
            qc.invalidateQueries({ queryKey: ['employees-directory'] });
        },
    });
}
