// The Report Center's export and schedule rights, as the server checks them (ReportCatalogue::canExport / canSchedule).
import { useAuth } from '@/modules/auth';
import { useDialogParam } from '@/shared/hooks/use-dialog-param';
import { useEffect } from 'react';
import { reportDialogAllowed } from '../lib/report-dialog';

const REPORT_DIALOGS = ['export', 'schedule'] as const;

export function useReportRights() {
    const { can } = useAuth();
    const canExport = can('reports.export');
    const canSchedule = can('reports.schedule');

    return { canExport, canSchedule, seesMyExports: canExport || canSchedule };
}

/** A report page's ?dialog=export|schedule; a dialog the reader has no right for is dropped from the URL in place. */
export function useReportDialog() {
    const rights = useReportRights();
    const [dialog, setDialog] = useDialogParam(REPORT_DIALOGS);
    const allowed = reportDialogAllowed(dialog, rights);

    useEffect(() => {
        if (!allowed) setDialog(null, { inPlace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowed]);

    return { ...rights, dialog: allowed ? dialog : null, setDialog };
}
