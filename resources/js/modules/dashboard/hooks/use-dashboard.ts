import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboardApi';

/**
 * The whole front page in one query.
 *
 * One request rather than one per card: the page cannot know which endpoints the reader is
 * allowed to call, and a card that 403s looks the same as a card that is empty.
 */
export const useDashboardSummary = () => useQuery({ queryKey: ['dashboard-summary'], queryFn: dashboardApi.summary });
