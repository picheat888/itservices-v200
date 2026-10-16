// The reader's Dashboard links: module rights from useAuth, plus whether the account has a linked employee.
import { useAuth } from '@/modules/auth';
import { dashLinks } from '../lib/links';

export function useDashLinks() {
    const { user, can } = useAuth();

    return dashLinks(can, !!user?.employee_code);
}
