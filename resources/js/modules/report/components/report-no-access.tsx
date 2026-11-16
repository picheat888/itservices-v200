// The screen a report page shows when the reader holds no right to that report (a shared or typed link).
import { useT } from '@/lang';
import { ErrorIcon, ErrorState } from '@/shared/components/error-state';
import { Button } from '@/shared/ui/button';
import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';

/**
 * Names the report as what is refused and leads back to the Report Center, where the reader
 * picks a report they may open; a reader who cannot open the Report Center either goes to the
 * Dashboard instead. Nothing of the report (filters, figures) loads behind it.
 */
export function ReportNoAccess() {
    const t = useT();
    const toReports = useCanOpen()('/reports');

    return (
        <div className="grid min-h-[72dvh] place-items-center px-4">
            <ErrorState
                variant="page"
                visual={<ErrorIcon icon={Lock} tone="info" />}
                title={t('rep_err_no_access')}
                lines={[t('err_noaccess_line1'), t('err_noaccess_line2')]}
                actions={
                    <Button asChild className="w-full">
                        <Link to={toReports ? '/reports' : '/'}>{toReports ? t('rep_back_to_reports') : t('noaccess_back')}</Link>
                    </Button>
                }
            />
        </div>
    );
}
