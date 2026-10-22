import { FRESH_VIEW } from '@/shared/lib/freshness';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboardApi';

/** The whole front page in one query, so a card the reader may not see is never asked for on its own. */
export const useDashboardSummary = () => useQuery({ queryKey: ['dashboard-summary'], queryFn: dashboardApi.summary, ...FRESH_VIEW });
