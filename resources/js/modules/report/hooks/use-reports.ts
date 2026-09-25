/**
 * Report module React Query hooks — catalogue, Ticket & SLA summary/rows, and export.
 */
import { downloadBlob } from '@/shared/lib/utils';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { reportApi } from '../api/reportApi';
import type { ExportFormat, TicketReportFilters } from '../types';

export const useReportCatalogue = () => useQuery({ queryKey: ['reports', 'catalogue'], queryFn: reportApi.catalogue });

export const useTicketOverview = (filters: TicketReportFilters) =>
    useQuery({
        queryKey: ['reports', 'tickets-overview', filters],
        queryFn: () => reportApi.ticketOverview(filters),
        // Keep the last numbers on screen while a filter change refetches.
        placeholderData: keepPreviousData,
        // An invalid range (to before from) is caught client-side instead of being sent.
        enabled: filters.from <= filters.to,
        // A 4xx (422 invalid range, 403 no access) answers the same however many times it
        // is asked — retrying only delays the message that can say so.
        retry: (count, error) => !(isAxiosError(error) && (error.response?.status ?? 500) < 500) && count < 2,
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
