/**
 * Report module React Query hooks — catalogue (+ pinning), the hub number strip, Ticket & SLA summary/rows/export, the
 * generic tabular report definition/rows/export, "ไฟล์ส่งออกของฉัน" (queued files: list, download, retry, remove) and
 * scheduled report emails.
 */
import { downloadBlob } from '@/shared/lib/utils';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { reportApi } from '../api/reportApi';
import { withoutFilters } from '../lib/filter-scope';
import type { ExportFormat, ReportDefinition, ReportExportItem, ScheduleInput, SnapshotRange, TabularFilters, TicketReportFilters } from '../types';

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

export const useReportSnapshot = (range: SnapshotRange) =>
    useQuery({
        queryKey: ['reports', 'snapshot', range],
        queryFn: () => reportApi.snapshot(range),
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

/** "สรุปผล SLA ของ Ticket จากคำขอ" — keyed without the request type, which the per-type table only highlights. */
export const useRequestSlaBreakdown = (filters: TabularFilters) => {
    const { request_type: _type, ...rest } = filters;
    void _type;
    return useQuery({
        queryKey: ['reports', 'tabular', 'tickets.request_sla', 'breakdown', rest],
        queryFn: () => reportApi.requestSlaBreakdown(rest),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/**
 * "สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง" — keyed without the picked dimension's own filter, which the
 * grouped table only highlights (the server sets it aside too).
 */
/** "การตัดจำหน่ายทรัพย์สิน" — the cards above the list, under the page's own filters. */
export const useAssetWriteoffBreakdown = (filters: TabularFilters) =>
    useQuery({
        queryKey: ['reports', 'tabular', 'assets.writeoffs', 'breakdown', filters],
        queryFn: () => reportApi.assetWriteoffBreakdown(filters),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });

/** "ประวัติโอนย้ายและรับคืน" — the cards above the list, under the page's own filters. */
export const useAssetTransferBreakdown = (filters: TabularFilters) =>
    useQuery({
        queryKey: ['reports', 'tabular', 'assets.transfer_history', 'breakdown', filters],
        queryFn: () => reportApi.assetTransferBreakdown(filters),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });

/** "ประกันใกล้หมดอายุ" — keyed without the soon / expired segment, which narrows only the list. */
export const useAssetWarrantyBreakdown = (filters: TabularFilters) => {
    const { state: _state, ...rest } = filters;
    void _state;
    return useQuery({
        queryKey: ['reports', 'tabular', 'assets.warranty_expiring', 'breakdown', rest],
        queryFn: () => reportApi.assetWarrantyBreakdown(rest),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "ภาพรวมและค่าใช้จ่ายสัญญา" — every filter of the page shapes its cards. */
export const useContractOverviewBreakdown = (filters: TabularFilters) =>
    useQuery({
        queryKey: ['reports', 'tabular', 'contracts.overview', 'breakdown', filters],
        queryFn: () => reportApi.contractOverviewBreakdown(filters),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });

/** "ต่ออายุและสิ้นสุดสัญญา" — every filter of the page shapes its cards. */
export const useContractRenewalsBreakdown = (filters: TabularFilters) =>
    useQuery({
        queryKey: ['reports', 'tabular', 'contracts.renewals', 'breakdown', filters],
        queryFn: () => reportApi.contractRenewalsBreakdown(filters),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });

/** "สัญญาเช่าและทรัพย์สิน" — every filter of the page shapes its cards. */
export const useContractRentalsBreakdown = (filters: TabularFilters) =>
    useQuery({
        queryKey: ['reports', 'tabular', 'contracts.rentals', 'breakdown', filters],
        queryFn: () => reportApi.contractRentalsBreakdown(filters),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });

/** "รับเข้าและเบิกจ่าย" — keyed without the type and search filters, which narrow only the rows. */
export const useStockMovementsBreakdown = (filters: TabularFilters) => {
    const scope = withoutFilters(filters, ['type', 'search', 'people_by', 'dept_by']);
    return useQuery({
        queryKey: ['reports', 'tabular', 'stock.movements', 'breakdown', scope],
        queryFn: () => reportApi.stockMovementsBreakdown(scope),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "มูลค่าคงคลัง" — keyed without the search, which narrows only the rows. */
export const useStockValuationBreakdown = (filters: TabularFilters) => {
    const scope = withoutFilters(filters, ['search', 'dead_days']);
    return useQuery({
        queryKey: ['reports', 'tabular', 'stock.valuation', 'breakdown', scope],
        queryFn: () => reportApi.stockValuationBreakdown(scope),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "ต่ำกว่าขั้นต่ำและเกินขั้นสูง" — keyed without the status and search filters, which narrow only the rows. */
export const useStockLevelsBreakdown = (filters: TabularFilters) => {
    const scope = withoutFilters(filters, ['status', 'search']);
    return useQuery({
        queryKey: ['reports', 'tabular', 'stock.below_min', 'breakdown', scope],
        queryFn: () => reportApi.stockLevelsBreakdown(scope),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "ภาพรวมคำขอ" — keyed without the search, which narrows only the rows. */
export const useRequestOverviewBreakdown = (filters: TabularFilters) => {
    const scope = withoutFilters(filters, ['search']);
    return useQuery({
        queryKey: ['reports', 'tabular', 'requests.overview', 'breakdown', scope],
        queryFn: () => reportApi.requestOverviewBreakdown(scope),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "ภาพรวมสิทธิ์การเข้าถึง" — keyed without the active / revoked segment and the search, which narrow only the list. */
export const useAccessOverviewBreakdown = (filters: TabularFilters) => {
    const scope = withoutFilters(filters, ['state', 'search']);
    return useQuery({
        queryKey: ['reports', 'tabular', 'access.overview', 'breakdown', scope],
        queryFn: () => reportApi.accessOverviewBreakdown(scope),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "ภาพรวมพนักงาน" — keyed without the รายการ segment, which narrows only the list. */
export const useEmployeeOverviewBreakdown = (filters: TabularFilters) => {
    const { kind: _kind, ...rest } = filters;
    void _kind;
    return useQuery({
        queryKey: ['reports', 'tabular', 'employees.overview', 'breakdown', rest],
        queryFn: () => reportApi.employeeOverviewBreakdown(rest),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "สรุปเรื่องค้างของพนักงาน" — keyed without the topic segment, which only picks the cards. */
export const useEmployeeOpenItemsBreakdown = (filters: TabularFilters) => {
    const { group: _group, ...rest } = filters;
    void _group;
    return useQuery({
        queryKey: ['reports', 'tabular', 'employees.open_items', 'breakdown', rest],
        queryFn: () => reportApi.employeeOpenItemsBreakdown(rest),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "ตรวจสอบสมาชิกและเจ้าของ" — keyed without the list's segment and order, which do not change the cards. */
export const useAccessMembersBreakdown = (filters: TabularFilters) => {
    const { state: _state, sort: _sort, ...rest } = filters;
    void _state;
    void _sort;
    return useQuery({
        queryKey: ['reports', 'tabular', 'access.resource_members', 'breakdown', rest],
        queryFn: () => reportApi.accessMembersBreakdown(rest),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "การใช้ License ซอฟต์แวร์" — keyed without the active / revoked segment, which narrows only the list. */
export const useSoftwareLicenseBreakdown = (filters: TabularFilters) => {
    const { state: _state, ...rest } = filters;
    void _state;
    return useQuery({
        queryKey: ['reports', 'tabular', 'access.software_licenses', 'breakdown', rest],
        queryFn: () => reportApi.softwareLicenseBreakdown(rest),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "คำขอที่รอ IT ส่งมอบ" — keyed without the "แยกตาม" switch, which only picks how a card is shown. */
export const useItPendingBreakdown = (filters: TabularFilters) => {
    const { by: _by, ...rest } = filters;
    void _by;
    return useQuery({
        queryKey: ['reports', 'tabular', 'requests.it_pending', 'breakdown', rest],
        queryFn: () => reportApi.itPendingBreakdown(rest),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });
};

/** "การอนุมัติคำขอ" — every filter shapes the cards. */
export const useRequestApprovalsBreakdown = (filters: TabularFilters) =>
    useQuery({
        queryKey: ['reports', 'tabular', 'requests.approvals', 'breakdown', filters],
        queryFn: () => reportApi.requestApprovalsBreakdown(filters),
        placeholderData: keepPreviousData,
        retry: noRetryOn4xx,
    });

/** Download one resource's review sheet (PDF). */
export const useAccessReviewSheet = () =>
    useMutation({
        mutationFn: (resource: string) => reportApi.accessReviewSheet(resource),
        onSuccess: ({ blob, filename }) => downloadBlob(blob, filename),
    });

export const useManualSlaBreakdown = (filters: TabularFilters) => {
    const by = (filters.by as string | null | undefined) ?? 'category';
    const rest = Object.fromEntries(Object.entries(filters).filter(([name]) => name !== by));
    return useQuery({
        queryKey: ['reports', 'tabular', 'tickets.manual_sla', 'breakdown', rest],
        queryFn: () => reportApi.manualSlaBreakdown(rest),
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

/** The tiles and charts — keyed by the filters alone, so turning a page of rows does not ask again. */
export const useTabularSummary = (key: string, filters: TabularFilters, enabled: boolean) =>
    useQuery({
        queryKey: ['reports', 'tabular', key, 'summary', filters],
        queryFn: () => reportApi.tabularSummary(key, filters),
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
export const useMyExports = (enabled = true) =>
    useQuery({
        queryKey: REPORT_EXPORTS_KEY,
        queryFn: reportApi.myExports,
        enabled,
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

/** "ลบทั้งหมด" on the panel. */
export function useDeleteAllExports() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => reportApi.deleteAllExports(),
        onSettled: () => queryClient.invalidateQueries({ queryKey: REPORT_EXPORTS_KEY }),
    });
}

export const useReportSchedules = () => useQuery({ queryKey: REPORT_SCHEDULES_KEY, queryFn: reportApi.schedules });

/** Mirrors ReportSchedule::MAX_PER_REPORT. */
export const MAX_SCHEDULES_PER_REPORT = 3;

/** Whether the reader already keeps the most schedules one report takes. */
export function useReportSchedulesFull(reportKey: string, enabled: boolean): boolean {
    const { data: items = [] } = useQuery({ queryKey: REPORT_SCHEDULES_KEY, queryFn: reportApi.schedules, enabled });

    return items.filter((s) => s.report_key === reportKey).length >= MAX_SCHEDULES_PER_REPORT;
}

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

/** Everyone's schedules for the admin's "จัดการ" dialog; fetched only while it is open. */
export const MANAGED_SCHEDULES_KEY = ['reports', 'schedules', 'manage'] as const;

export const useManagedSchedules = (enabled: boolean) => useQuery({ queryKey: MANAGED_SCHEDULES_KEY, queryFn: reportApi.managedSchedules, enabled });

/** Pause / resume, delete and take a recipient off anyone's schedule; the admin's own card refreshes too. */
export function useManageSchedule() {
    const queryClient = useQueryClient();
    // REPORT_SCHEDULES_KEY is the prefix of MANAGED_SCHEDULES_KEY, so this refreshes both lists.
    const refresh = () => queryClient.invalidateQueries({ queryKey: REPORT_SCHEDULES_KEY });

    return {
        setActive: useMutation({
            mutationFn: ({ id, active }: { id: number; active: boolean }) => reportApi.setManagedScheduleActive(id, active),
            onSuccess: refresh,
        }),
        remove: useMutation({ mutationFn: (id: number) => reportApi.deleteManagedSchedule(id), onSuccess: refresh }),
        removeRecipient: useMutation({
            mutationFn: ({ id, email }: { id: number; email: string }) => reportApi.removeScheduleRecipient(id, email),
            onSuccess: refresh,
        }),
    };
}

export function useSendScheduleNow() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => reportApi.sendScheduleNow(id),
        // The run lands in a moment; its last-sent line refreshes shortly after.
        onSuccess: () => setTimeout(() => queryClient.invalidateQueries({ queryKey: REPORT_SCHEDULES_KEY }), 5000),
    });
}
