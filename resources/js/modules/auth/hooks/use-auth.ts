import { authApi, type LoginPayload } from '@/modules/auth/api/authApi';
import { httpStatus } from '@/shared/lib/http-errors';
import { announceSignIn } from '@/shared/lib/login-redirect';
import { ME_KEY } from '@/shared/lib/query-client';
import { SUPER_ROLE, type User } from '@/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

/** Signing out leaves through a full page load, as the idle-timeout logout does, so the cache goes with the document. */
export function useLogout() {
    return useMutation({
        mutationFn: () => authApi.logout(),
        // onSettled: a failed logout call still leaves; the login page sends them back if the session survived
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
