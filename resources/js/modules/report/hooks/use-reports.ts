/**
 * Report module React Query hooks — catalogue (+ pinning), the hub number strip, Ticket & SLA summary/rows/export, the
 * generic tabular report definition/rows/export, "ไฟล์ส่งออกของฉัน" (queued files: list, download, retry, remove) and
 * scheduled report emails.
 */
import { downloadBlob } from '@/shared/lib/utils';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { reportApi } from '../api/reportApi';
import type { ExportFormat, ReportDefinition, ReportExportItem, ScheduleInput, SnapshotPeriod, TabularFilters, TicketReportFilters } from '../types';

/**
 * A 4xx (422 invalid filters, 403 no access, 404 unknown report) answers the same however
 * many times it is asked — retrying only delays the message that can say so.
 */
export function noRetryOn4xx(count: number, error: unknown): boolean {
    return !(isAxiosError(error) && (error.response?.status ?? 500) < 500) && count < 2;
}

const CATALOGUE_KEY = ['reports', 'catalogue'] as const;

/** "ไฟล์ส่งออกของฉัน" — also refreshed by the shell when a report_export bell arrives. */
export const REPORT_EXPORTS_KEY = ['reports', 'exports'] as const;

/** Scheduled report emails — also refreshed by the shell when a report_schedule bell arrives. */
export const REPORT_SCHEDULES_KEY = ['reports', 'schedules'] as const;

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
            queryClient.setQueryData<ReportDefinition[]>(CATALOGUE_KEY, (list) => {
                // A new pin goes to the end of the pinned list, as the server will put it.
                const next = Math.max(-1, ...(list ?? []).map((r) => r.pin_order ?? -1)) + 1;
                return list?.map((r) => (r.key === key ? { ...r, pinned, pin_order: pinned ? next : null } : r));
            });
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(CATALOGUE_KEY, context.previous);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: CATALOGUE_KEY }),
    });
}

export const useTicketOverview = (filters: TicketReportFilters, enabled = true) =>
    useQuery({
        queryKey: ['reports', 'tickets-overview', filters],
        queryFn: () => reportApi.ticketOverview(filters),
        // Keep the last numbers on screen while a filter change refetches.
        placeholderData: keepPreviousData,
        // An invalid range (to before from) is caught client-side instead of being sent.
        enabled: enabled && filters.from <= filters.to,
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

/** Queue the file; the exports list picks it up (and polls until it is built). */
export function useExportTicketOverview() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ filters, format }: { filters: TicketReportFilters; format: ExportFormat }) => reportApi.exportTicketOverview(filters, format),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: REPORT_EXPORTS_KEY }),
    });
}

/** The backlog page's due board — keyed without the SLA filter, which the page applies itself. */
export const useBacklogBoard = (filters: TabularFilters) => {
    const { sla: _sla, ...rest } = filters;
    void _sla;
    return useQuery({
        queryKey: ['reports', 'tabular', 'tickets.backlog', 'board', rest],
        queryFn: () => reportApi.backlogBoard(rest),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

export const useTabularDefinition = (key: string, enabled = true) =>
    useQuery({
        queryKey: ['reports', 'tabular', key, 'definition'],
        queryFn: () => reportApi.tabularDefinition(key),
        enabled,
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

/** Queue the file; the exports list picks it up (and polls until it is built). */
export function useExportTabular() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ key, filters, format, columns }: { key: string; filters: TabularFilters; format: ExportFormat; columns?: string[] }) =>
            reportApi.exportTabular(key, filters, format, columns),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: REPORT_EXPORTS_KEY }),
    });
}

const isBuilding = (item: ReportExportItem) => item.status === 'queued' || item.status === 'running';

/** Polls every few seconds only while a file is still waiting or being built. */
export const useMyExports = () =>
    useQuery({
        queryKey: REPORT_EXPORTS_KEY,
        queryFn: reportApi.myExports,
        refetchInterval: (query) => (query.state.data?.some(isBuilding) ? 3000 : false),
    });

export const useDownloadExport = () =>
    useMutation({
        mutationFn: (item: ReportExportItem) => reportApi.downloadExport(item),
        onSuccess: ({ blob, filename }) => downloadBlob(blob, filename),
    });

export function useRetryExport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => reportApi.retryExport(id),
        onSettled: () => queryClient.invalidateQueries({ queryKey: REPORT_EXPORTS_KEY }),
    });
}

export function useDeleteExport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => reportApi.deleteExport(id),
        onSettled: () => queryClient.invalidateQueries({ queryKey: REPORT_EXPORTS_KEY }),
    });
}

export const useReportSchedules = () => useQuery({ queryKey: REPORT_SCHEDULES_KEY, queryFn: reportApi.schedules });

/** Set a schedule from a report page — a tabular one (key given) or the ticket overview. */
export function useCreateSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (
            args:
                | { kind: 'tabular'; key: string; filters: TabularFilters; columns?: string[]; input: ScheduleInput }
                | { kind: 'tickets'; filters: TicketReportFilters; input: ScheduleInput },
        ) =>
            args.kind === 'tabular'
                ? reportApi.scheduleTabular(args.key, args.filters, args.input, args.columns)
                : reportApi.scheduleTicketOverview(args.filters, args.input),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: REPORT_SCHEDULES_KEY }),
    });
}

export function useUpdateSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, patch }: { id: number; patch: Partial<ScheduleInput> & { active?: boolean } }) => reportApi.updateSchedule(id, patch),
        onSettled: () => queryClient.invalidateQueries({ queryKey: REPORT_SCHEDULES_KEY }),
    });
}

export function useDeleteSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => reportApi.deleteSchedule(id),
        onSettled: () => queryClient.invalidateQueries({ queryKey: REPORT_SCHEDULES_KEY }),
    });
}

export function useSendScheduleNow() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => reportApi.sendScheduleNow(id),
        // The run lands in a moment; its last-sent line refreshes shortly after.
        onSuccess: () => setTimeout(() => queryClient.invalidateQueries({ queryKey: REPORT_SCHEDULES_KEY }), 5000),
    });
}
