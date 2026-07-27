import { ticketApi, type CreateTicketPayload, type TicketListParams, type UpdateTicketPayload } from '../api/ticketApi';
import type { TicketPriority } from '@/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const SUMMARY = ['tickets-summary'] as const;

/** Paginated ticket list with search + status/category/priority filters and a "mine" scope. */
export const useTickets = (params: TicketListParams) =>
    useQuery({
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
                mine: params.mine || undefined,
            }),
        placeholderData: (prev) => prev,
    });

export const useTicketSummary = (enabled = true, days?: number) =>
    useQuery({
        queryKey: [...SUMMARY, days ?? 30],
        queryFn: () => ticketApi.summary(days),
        enabled,
        // Keep the prior window's numbers on screen while a new range loads (no skeleton flash).
        placeholderData: (prev) => prev,
    });

export const useTicketStaff = (enabled = true) => useQuery({ queryKey: ['tickets-staff'], queryFn: ticketApi.staff, enabled });

export function useTicketMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['tickets-list'] });
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
