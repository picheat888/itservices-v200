import { useT } from '@/lang';
import {
    notificationApi,
    notificationTemplateApi,
    type NotificationsResponse,
    type NotificationTemplatePayload,
} from '@/modules/notification/api/notificationApi';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback } from 'react';

const KEY = ['notifications'] as const;
// Under KEY, so every invalidation of the tray reaches the tab lists too.
const FEED = [...KEY, 'feed'] as const;
const PAGE_SIZE = 30;

export function useNotifications() {
    return useQuery({
        queryKey: KEY,
        queryFn: () => notificationApi.list(),
        // Near-realtime without WebSockets: poll often (even in a background tab) and
        // refetch the moment the tab regains focus — so new alerts surface within seconds
        // of a job/command running, no manual reload needed.
        staleTime: 10_000,
        refetchInterval: 15_000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
    });
}

/** The tray's list for one tab, a page at a time: every kind when `kinds` is null, else only those. */
export function useNotificationFeed(tab: string, kinds: string[] | null) {
    return useInfiniteQuery({
        queryKey: [...FEED, tab, kinds?.join(',') ?? 'all'],
        // A new kind joining this tab keeps its loaded rows on screen; another tab starts fresh.
        placeholderData: (previous: InfiniteData<NotificationsResponse, number> | undefined, previousQuery) =>
            previousQuery?.queryKey[2] === tab ? previous : undefined,
        queryFn: ({ pageParam }: { pageParam: number }) => notificationApi.list({ kinds: kinds ?? undefined, offset: pageParam }),
        initialPageParam: 0,
        getNextPageParam: (last: NotificationsResponse, pages: NotificationsResponse[]) => (last.has_more ? pages.length * PAGE_SIZE : undefined),
        // An empty list of kinds would ask for everything.
        enabled: kinds === null || kinds.length > 0,
        staleTime: 10_000,
        refetchInterval: 15_000,
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

/** Dismiss one notification and take it out of the cached figures and tab lists at once; the refetch settles the rest. */
export function useDismissNotification() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => notificationApi.dismiss(id),
        onMutate: async (id: string) => {
            await qc.cancelQueries({ queryKey: KEY });
            const feeds = qc.getQueriesData<InfiniteData<NotificationsResponse>>({ queryKey: FEED });
            qc.setQueriesData<InfiniteData<NotificationsResponse>>({ queryKey: FEED }, (old) =>
                old ? { ...old, pages: old.pages.map((page) => ({ ...page, data: page.data.filter((n) => n.id !== id) })) } : old,
            );
            const previous = qc.getQueryData<NotificationsResponse>(KEY);
            if (!previous) return { previous, feeds };

            // The row may only be on a later page or another tab, not in the badge's first page.
            const going =
                previous.data.find((n) => n.id === id) ??
                feeds.flatMap(([, feed]) => feed?.pages.flatMap((page) => page.data) ?? []).find((n) => n.id === id);

            qc.setQueryData<NotificationsResponse>(KEY, {
                ...previous,
                data: previous.data.filter((n) => n.id !== id),
                unread: Math.max(0, previous.unread - (going && !going.read ? 1 : 0)),
                total: Math.max(0, previous.total - 1),
                // An emptied kind drops out, so its chip does not lead nowhere.
                counts: previous.counts
                    .map((c) =>
                        c.type === (going?.data.type ?? null) && c.module === (going?.data.module ?? null)
                            ? { ...c, count: c.count - 1, unread: Math.max(0, c.unread - (going && !going.read ? 1 : 0)) }
                            : c,
                    )
                    .filter((c) => c.count > 0),
            });

            return { previous, feeds };
        },
        onError: (_err, _id, context) => {
            // Put the tray back exactly as it was; the row never actually went.
            if (context?.previous) qc.setQueryData(KEY, context.previous);
            context?.feeds.forEach(([key, data]) => qc.setQueryData(key, data));
        },
        onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}

/* ------------------------------------------------------------------------------------
 * Bell CONFIGURATION hooks — the Settings page, and the wording every tray reads.
 *
 * Same file as the tray hooks above on purpose: one module, one hooks file. The two
 * halves share a subject (what an alert says vs. which alerts you have) and a cache —
 * rewording a bell has to invalidate the wording every open tray is holding.
 * ---------------------------------------------------------------------------------- */

const BELLS = ['notification-templates'] as const;
const BELL_MESSAGES = ['notification-messages'] as const;

/** Every bell with its catalogue description — the Settings page. Needs the admin gate. */
export const useNotificationTemplates = (enabled = true) => useQuery({ queryKey: BELLS, queryFn: notificationTemplateApi.list, enabled });

/**
 * The wording overrides, for rendering the tray. Fetched by every signed-in user, so it is
 * kept cheap and long-lived: an administrator rewording a bell is rare, and the tray falling
 * back to the bundled text in the meantime says the right thing anyway.
 */
export const useNotificationMessages = () =>
    useQuery({
        queryKey: BELL_MESSAGES,
        queryFn: notificationTemplateApi.messages,
        staleTime: 5 * 60_000,
    });

/**
 * A translate function that prefers an administrator's wording over the bundled string.
 *
 * Drop-in for `useT()` wherever a bell is rendered: a key with no override — every key that
 * is not a bell message included — falls straight through, so the same function still serves
 * the surrounding UI text. If the request fails the tray renders the standard wording rather
 * than nothing.
 */
export function useNotificationText(): (key: string) => string {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: overrides } = useNotificationMessages();

    return useCallback((key: string) => overrides?.[key]?.[lang] ?? t(key), [overrides, lang, t]);
}

export function useNotificationTemplateMutations() {
    const qc = useQueryClient();
    const t = useT();
    // Both lists: the settings table AND the wording every tray reads.
    const invalidate = () => Promise.all([qc.invalidateQueries({ queryKey: BELLS }), qc.invalidateQueries({ queryKey: BELL_MESSAGES })]);

    return {
        update: useMutation({
            mutationFn: (v: { key: string; payload: NotificationTemplatePayload }) => notificationTemplateApi.update(v.key, v.payload),
            onSuccess: () => {
                useToastStore.getState().push(t('notification_saved'), 'success');

                return invalidate();
            },
        }),
        // A test lands in the reader's own tray, so the tray query has to refetch — but not
        // the settings table, which nothing about a sample changes.
        test: useMutation({
            mutationFn: (key: string) => notificationTemplateApi.test(key),
            onSuccess: () => {
                useToastStore.getState().push(t('notification_test_sent'), 'success');

                return qc.invalidateQueries({ queryKey: KEY });
            },
            onError: () => useToastStore.getState().push(t('notification_test_failed'), 'error'),
        }),
        reset: useMutation({
            mutationFn: (key: string) => notificationTemplateApi.reset(key),
            onSuccess: () => {
                useToastStore.getState().push(t('notification_reset_done'), 'success');

                return invalidate();
            },
        }),
    };
}
