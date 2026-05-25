import { authApi, type LoginPayload } from '@/services/authApi';
import type { User } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const ME_KEY = ['auth', 'me'] as const;

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
    return {
        user,
        isLoading: query.isLoading,
        isAuthenticated: !!user,
        can: (permission: string) => !!user?.permissions?.includes(permission),
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
