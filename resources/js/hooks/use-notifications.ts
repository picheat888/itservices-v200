import { notificationApi } from '@/services/notificationApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const KEY = ['notifications'] as const;

export function useNotifications() {
    return useQuery({
        queryKey: KEY,
        queryFn: notificationApi.list,
        staleTime: 60_000,
        refetchInterval: 60_000,
    });
}

export function useMarkRead() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => notificationApi.markRead(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}

export function useMarkAllRead() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: notificationApi.markAllRead,
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}
