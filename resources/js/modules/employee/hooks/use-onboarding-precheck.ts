import { useQuery } from '@tanstack/react-query';
import { employeeApi } from '../api/employeeApi';

/**
 * Whether the day-one service requests on Step 3 of the Add Employee wizard could
 * actually be routed for this prospective hire — asked before the employee exists,
 * so the step can say why up front instead of after Save.
 *
 * Keyed on the two Step-2 answers that decide routing (who they report to, what
 * position they hold), so going back and picking a different manager re-asks rather
 * than showing a verdict about somebody else. Off until the caller says the step is
 * open: nothing reads the answer before then.
 */
export function useOnboardingPrecheck(managerId: string, positionId: string, enabled: boolean) {
    const manager = managerId ? Number(managerId) : null;
    const position = positionId ? Number(positionId) : null;

    return useQuery({
        queryKey: ['employees', 'onboarding-precheck', manager, position],
        queryFn: () => employeeApi.onboardingPrecheck({ manager_id: manager, position_id: position }),
        enabled,
        // A reporting line can be fixed in another tab while this dialog sits open,
        // and re-opening the step should pick that up rather than repeat a stale no.
        staleTime: 30_000,
    });
}
