// The Report Center's export and schedule rights, as the server checks them (ReportCatalogue::canExport / canSchedule).
import { useAuth } from '@/modules/auth';

export function useReportRights() {
    const { can } = useAuth();
    const canExport = can('reports.export');
    const canSchedule = can('reports.schedule');

    return { canExport, canSchedule, seesMyExports: canExport || canSchedule };
}
