import { ticketApi, type CreateTicketPayload, type TicketListParams } from '@/services/ticketApi';
import type { TicketPriority } from '@/types';
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
                mine: params.mine || undefined,
            }),
        placeholderData: (prev) => prev,
    });

export const useTicketSummary = (enabled = true) => useQuery({ queryKey: SUMMARY, queryFn: ticketApi.summary, enabled });

export const useTicketStaff = (enabled = true) => useQuery({ queryKey: ['tickets-staff'], queryFn: ticketApi.staff, enabled });

export function useTicketMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['tickets-list'] });
        qc.invalidateQueries({ queryKey: SUMMARY });
    };
    return {
        create: useMutation({ mutationFn: (p: CreateTicketPayload) => ticketApi.create(p), onSuccess: invalidate }),
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
        remove: useMutation({ mutationFn: (id: number) => ticketApi.remove(id), onSuccess: invalidate }),
        uploadAttachments: useMutation({
            mutationFn: (v: { id: number; files: File[] }) => ticketApi.uploadAttachments(v.id, v.files),
            onSuccess: invalidate,
        }),
        deleteAttachment: useMutation({
            mutationFn: (v: { id: number; attachmentId: number }) => ticketApi.deleteAttachment(v.id, v.attachmentId),
            onSuccess: invalidate,
        }),
    };
}
