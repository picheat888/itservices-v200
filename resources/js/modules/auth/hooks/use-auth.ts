import { disablePush } from '@/modules/notification';
import { httpStatus } from '@/shared/lib/http-errors';
import { announceSignIn, announceSignOut } from '@/shared/lib/login-redirect';
import { ME_KEY } from '@/shared/lib/query-client';
import { SUPER_ROLE, type User } from '@/shared/types';
import { clearNewRows } from '@/stores/new-rows';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, type LoginPayload } from '../api/authApi';

export function useAuth() {
    const query = useQuery<User | null>({
        queryKey: ME_KEY,
        queryFn: async () => {
            try {
                return await authApi.me();
            } catch (error) {
                // Only a 401 means signed out; a 429 or an outage is an error, not a reason to send the reader to the login page
                if (httpStatus(error) === 401) return null;
                throw error;
            }
        },
        staleTime: 5 * 60 * 1000,
    });

    const user = query.data ?? null;
    // The all-access role passes every permission check, as User::hasPermission does on the server
    const isSuper = user?.role === SUPER_ROLE;

    return {
        user,
        // Still unknown while /me has not answered, or failed for a reason other than 401 (the error screen covers it)
        isLoading: query.data === undefined,
        isAuthenticated: !!user,
        // /me failed for a reason other than 401 (outage, 429); callers that cannot wait on it read this
        isError: query.isError,
        isSuper,
        can: (permission: string) => isSuper || !!user?.permissions?.includes(permission),
    };
}

/** Signing in drops the previous session's cache (removeQueries, not clear: that would drop this mutation); App-level settings are kept and refetched as the signed-in user. */
export function useLogin() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: LoginPayload) => authApi.login(payload),
        onSuccess: (user) => {
            qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'settings' });
            qc.setQueryData(ME_KEY, user);
            qc.invalidateQueries({ queryKey: ['settings'] });
            announceSignIn(user.id);
        },
    });
}

// Sign-out waits at most this long for this browser's push to stop
const PUSH_STOP_WAIT_MS = 2000;

/** Signing out stops push on this browser first, then leaves through a full page load, so the cache goes with the document. */
export function useLogout() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const userId = qc.getQueryData<User | null>(ME_KEY)?.id;
            if (userId !== undefined) {
                await Promise.race([
                    disablePush(userId, { keepWanted: true }),
                    new Promise((resolve) => window.setTimeout(resolve, PUSH_STOP_WAIT_MS)),
                ]);
            }
            clearNewRows();
            return authApi.logout();
        },
        // onSettled: a failed logout call still leaves and still takes the other tabs along; the login page sends them back if the session survived
        onSettled: () => {
            announceSignOut();
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
