import type { TicketPriority } from '@/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ticketApi, type CreateTicketPayload, type SummaryRange, type TicketListParams, type UpdateTicketPayload } from '../api/ticketApi';

const SUMMARY = ['tickets-summary'] as const;

/** Paginated ticket list with search + status/category/priority filters and a "mine" scope. */
export const useTickets = (params: TicketListParams, enabled = true) =>
    useQuery({
        enabled,
        queryKey: ['tickets-list', params],
        queryFn: () =>
            ticketApi.list({
                page: params.page,
                per_page: params.per_page,
                search: params.search || undefined,
                status: params.status || undefined,
                category: params.category || undefined,
                priority: params.priority || undefined,
                sort: params.sort || undefined,
                sla: params.sla || undefined,
                mine: params.mine || undefined,
                requested: params.requested || undefined,
            }),
        placeholderData: (prev) => prev,
    });

export const useTicketSummary = (enabled = true, range?: SummaryRange) =>
    useQuery({
        queryKey: [...SUMMARY, typeof range === 'object' ? `${range.from}_${range.to}` : (range ?? 30)],
        queryFn: () => ticketApi.summary(range),
        enabled,
        // Keep the prior window's numbers on screen while a new range loads (no skeleton flash).
        placeholderData: (prev) => prev,
    });

/** Staff able to receive a case (tickets.resolve), narrowed to the case's category Level. */
export const useTicketStaff = (enabled = true, category?: string) =>
    useQuery({ queryKey: ['tickets-staff', category ?? 'all'], queryFn: () => ticketApi.staff(category), enabled });

/** Assets the case's requester holds — one-click Related-asset picks in the Take Case dialog (tickets.resolve). */
export const useTicketRequesterAssets = (ticketId?: number | null) =>
    useQuery({
        queryKey: ['tickets-requester-assets', ticketId],
        queryFn: () => ticketApi.requesterAssets(ticketId!),
        enabled: !!ticketId,
    });

/**
 * "Needs my attention" count for the Tickets sidebar badge: open cases waiting
 * for a take (staff only) + own unfinished assignments + own unresolved requests,
 * deduped server-side. Polls every minute — the sidebar must stay fresh without
 * the Tickets page ever being opened.
 */
export function useTicketSidebarBadge(enabled = true): number {
    const { data } = useQuery({
        queryKey: ['tickets-badge'],
        queryFn: ticketApi.badge,
        enabled,
        refetchInterval: 60_000,
        staleTime: 30_000,
    });

    return data ?? 0;
}

export function useTicketMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['tickets-list'] });
        qc.invalidateQueries({ queryKey: ['tickets-badge'] });
        qc.invalidateQueries({ queryKey: SUMMARY });
        // Refresh the open detail drawer (?view=<id>) so a stacked action modal
        // bounces back to up-to-date status/assignee without reopening.
        qc.invalidateQueries({ queryKey: ['ticket', 'view'] });
    };
    return {
        create: useMutation({ mutationFn: (p: CreateTicketPayload) => ticketApi.create(p), onSuccess: invalidate }),
        update: useMutation({
            mutationFn: (v: { id: number; payload: UpdateTicketPayload }) => ticketApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        take: useMutation({
            mutationFn: (v: { id: number; priority: TicketPriority; note?: string | null; related_asset_id?: number | null }) =>
                ticketApi.take(v.id, { priority: v.priority, note: v.note, related_asset_id: v.related_asset_id }),
            onSuccess: invalidate,
        }),
        assign: useMutation({
            mutationFn: (v: { id: number; assignee_id: number; priority: TicketPriority }) =>
                ticketApi.assign(v.id, { assignee_id: v.assignee_id, priority: v.priority }),
            onSuccess: invalidate,
        }),
        forward: useMutation({
            mutationFn: (v: { id: number; assignee_id: number }) => ticketApi.forward(v.id, { assignee_id: v.assignee_id }),
            onSuccess: invalidate,
        }),
        resolve: useMutation({
            mutationFn: (v: { id: number; mode: 'complete' | 'cancel'; resolution: string }) =>
                ticketApi.resolve(v.id, { mode: v.mode, resolution: v.resolution }),
            onSuccess: invalidate,
        }),
        uploadAttachments: useMutation({
            mutationFn: (v: { id: number; files: File[]; onProgress?: (index: number, percent: number) => void }) =>
                ticketApi.uploadAttachments(v.id, v.files, v.onProgress),
            onSuccess: invalidate,
        }),
        deleteAttachment: useMutation({
            mutationFn: (v: { id: number; attachmentId: number }) => ticketApi.deleteAttachment(v.id, v.attachmentId),
            onSuccess: invalidate,
        }),
    };
}
