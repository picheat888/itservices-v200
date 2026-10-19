/**
 * /reports/<anything not listed in ../routes.tsx> — a mistyped or retired report address. Says so
 * plainly and offers the way back to the Report Center, instead of an empty report shell.
 */
import { useT } from '@/lang';
import { ErrorIcon, ErrorState } from '@/shared/components/error-state';
import { Button } from '@/shared/ui/button';
import { SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UnknownReportPage() {
    const t = useT();

    return (
        <div className="grid min-h-[72dvh] place-items-center px-4">
            <ErrorState
                variant="page"
                visual={<ErrorIcon icon={SearchX} tone="info" />}
                title={t('rep_empty_unknown')}
                lines={[t('rep_empty_unknown_hint')]}
                actions={
                    <Button asChild className="w-full">
                        <Link to="/reports">{t('rep_back_to_reports')}</Link>
                    </Button>
                }
            />
        </div>
    );
}
