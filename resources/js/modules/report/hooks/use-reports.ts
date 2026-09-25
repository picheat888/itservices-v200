/**
 * Report module React Query hooks — catalogue, Ticket & SLA summary/rows, and export.
 */
import { downloadBlob } from '@/shared/lib/utils';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { reportApi } from '../api/reportApi';
import type { ExportFormat, TicketReportFilters } from '../types';

export const useReportCatalogue = () => useQuery({ queryKey: ['reports', 'catalogue'], queryFn: reportApi.catalogue });

export const useTicketOverview = (filters: TicketReportFilters) =>
    useQuery({
        queryKey: ['reports', 'tickets-overview', filters],
        queryFn: () => reportApi.ticketOverview(filters),
        // Keep the last numbers on screen while a filter change refetches.
        placeholderData: keepPreviousData,
    });

export const useTicketOverviewRows = (filters: TicketReportFilters, page: number, perPage: number) =>
    useQuery({
        queryKey: ['reports', 'tickets-overview', 'rows', filters, page, perPage],
        queryFn: () => reportApi.ticketOverviewRows(filters, page, perPage),
        placeholderData: keepPreviousData,
    });

export const useExportTicketOverview = () =>
    useMutation({
        mutationFn: ({ filters, format }: { filters: TicketReportFilters; format: ExportFormat }) => reportApi.exportTicketOverview(filters, format),
        onSuccess: ({ blob, filename }) => downloadBlob(blob, filename),
    });
