/**
 * Report module React Query hooks — catalogue (+ pinning), the hub number strip, Ticket & SLA summary/rows/export, and the
 * generic tabular report definition/rows/export.
 */
import { downloadBlob } from '@/shared/lib/utils';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { reportApi } from '../api/reportApi';
import type { ExportFormat, ReportDefinition, SnapshotPeriod, TabularFilters, TicketReportFilters } from '../types';

/**
 * A 4xx (422 invalid filters, 403 no access, 404 unknown report) answers the same however
 * many times it is asked — retrying only delays the message that can say so.
 */
export function noRetryOn4xx(count: number, error: unknown): boolean {
    return !(isAxiosError(error) && (error.response?.status ?? 500) < 500) && count < 2;
}

const CATALOGUE_KEY = ['reports', 'catalogue'] as const;

export const useReportCatalogue = () => useQuery({ queryKey: CATALOGUE_KEY, queryFn: reportApi.catalogue });

export const useReportSnapshot = (period: SnapshotPeriod) =>
    useQuery({
        queryKey: ['reports', 'snapshot', period],
        queryFn: () => reportApi.snapshot(period),
        // Keep the last numbers on screen while another period loads.
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });

/** Pin / unpin a report. The star flips at once; a failed call puts it back. */
export function useToggleReportPin() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ key, pinned }: { key: string; pinned: boolean }) => (pinned ? reportApi.pin(key) : reportApi.unpin(key)),
        onMutate: async ({ key, pinned }) => {
            await queryClient.cancelQueries({ queryKey: CATALOGUE_KEY });
            const previous = queryClient.getQueryData<ReportDefinition[]>(CATALOGUE_KEY);
            queryClient.setQueryData<ReportDefinition[]>(CATALOGUE_KEY, (list) => list?.map((r) => (r.key === key ? { ...r, pinned } : r)));
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(CATALOGUE_KEY, context.previous);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: CATALOGUE_KEY }),
    });
}

export const useTicketOverview = (filters: TicketReportFilters) =>
    useQuery({
        queryKey: ['reports', 'tickets-overview', filters],
        queryFn: () => reportApi.ticketOverview(filters),
        // Keep the last numbers on screen while a filter change refetches.
        placeholderData: keepPreviousData,
        // An invalid range (to before from) is caught client-side instead of being sent.
        enabled: filters.from <= filters.to,
        retry: noRetryOn4xx,
    });

export const useTicketOverviewRows = (filters: TicketReportFilters, page: number, perPage: number) =>
    useQuery({
        queryKey: ['reports', 'tickets-overview', 'rows', filters, page, perPage],
        queryFn: () => reportApi.ticketOverviewRows(filters, page, perPage),
        placeholderData: keepPreviousData,
        // Same guard as the summary — don't fetch the row table for an invalid range.
        enabled: filters.from <= filters.to,
    });

export const useExportTicketOverview = () =>
    useMutation({
        mutationFn: ({ filters, format }: { filters: TicketReportFilters; format: ExportFormat }) => reportApi.exportTicketOverview(filters, format),
        onSuccess: ({ blob, filename }) => downloadBlob(blob, filename),
    });

export const useTabularDefinition = (key: string) =>
    useQuery({
        queryKey: ['reports', 'tabular', key, 'definition'],
        queryFn: () => reportApi.tabularDefinition(key),
        staleTime: 5 * 60 * 1000,
        retry: noRetryOn4xx,
    });

export const useTabularRows = (key: string, filters: TabularFilters, page: number, perPage: number, enabled: boolean) =>
    useQuery({
        queryKey: ['reports', 'tabular', key, 'rows', filters, page, perPage],
        queryFn: () => reportApi.tabularRows(key, filters, page, perPage),
        placeholderData: keepPreviousData,
        enabled,
        retry: noRetryOn4xx,
    });

export const useExportTabular = () =>
    useMutation({
        mutationFn: ({ key, filters, format, columns }: { key: string; filters: TabularFilters; format: ExportFormat; columns?: string[] }) =>
            reportApi.exportTabular(key, filters, format, columns),
        onSuccess: ({ blob, filename }) => downloadBlob(blob, filename),
    });
