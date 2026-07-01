import { notificationApi } from '@/modules/notifications/api/notificationApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const KEY = ['notifications'] as const;

export function useNotifications() {
    return useQuery({
        queryKey: KEY,
        queryFn: notificationApi.list,
        // Near-realtime without WebSockets: poll often (even in a background tab) and
        // refetch the moment the tab regains focus — so new alerts surface within seconds
        // of a job/command running, no manual reload needed.
        staleTime: 10_000,
        refetchInterval: 15_000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
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

export function useDismissNotification() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => notificationApi.dismiss(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}
