import { useQuery } from '@tanstack/react-query';
import { employeeApi } from '../api/employeeApi';

/**
 * The detail each day-one service asks for on Step 3 of the Add Employee wizard —
 * device type, mailbox address — read from the Request module's own schemas.
 *
 * Not cached for long: the choices are rows an administrator edits under Settings →
 * Request data, and a device type added there should reach this form on the next open
 * rather than after a reload.
 */
export function useOnboardingServices(enabled: boolean) {
    return useQuery({
        queryKey: ['employees', 'onboarding-services'],
        queryFn: employeeApi.onboardingServices,
        enabled,
        staleTime: 60_000,
    });
}
