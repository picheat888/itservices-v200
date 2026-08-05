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

export function useLogin() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: LoginPayload) => authApi.login(payload),
        onSuccess: (user) => qc.setQueryData(ME_KEY, user),
    });
}

export function useLogout() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => authApi.logout(),
        onSuccess: () => qc.setQueryData(ME_KEY, null),
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
